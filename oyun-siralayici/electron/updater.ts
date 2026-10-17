import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { EventEmitter } from "node:events";
import {
  UPDATE_CHANNEL,
  compareVersions,
  manifestFromTelegraph,
  parseManifest,
  type UpdateAsset,
  type UpdateManifest,
  type UpdateState,
} from "../shared/update";
// Checks the update channel, downloads the new portable EXE, verifies size and
// SHA-256, puts it on the Desktop and, on request, starts the new one, which
// takes over from this app and deletes the old EXE (Windows; see install()).
//
// 2.0.2:
// - The file is downloaded into a private temporary folder, in 4 parts at the
//   same time when the server allows it (like download managers / Chrome's
//   parallel downloading). Before, one connection wrote straight to the
//   Desktop: slower, and when the Desktop is synced (OneDrive) the half-written
//   file was being uploaded and could be locked at the end.
// - Only the verified file is copied to the Desktop, with retries while another
//   program still holds it. A verified file is never thrown away: if the
//   Desktop copy fails, the copy in the temporary folder is used.
// - Every failure stays visible (the top-right shows it) instead of vanishing.
// 2.0.3: the file host closes any single connection after about 30 seconds.
//   A slow line therefore always got "terminated" part-way. A part now picks
//   up where it stopped as many times as needed while data keeps arriving
//   (only failures without any progress are counted).
const UA = "OyunSiralayici-Updater";
const PARTS = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const busyError = (e: any) => ["EBUSY", "EPERM", "EACCES"].includes(e?.code);
export class Updater extends EventEmitter {
  state: UpdateState;
  private manifest?: UpdateManifest;
  private download?: AbortController;
  private timer?: NodeJS.Timeout;
  private handoffToken?: string;
  private handoffTimer?: NodeJS.Timeout;
  constructor(
    current: string,
    private options: {
      channel?: string;
      desktop?: () => string;
      // Private folder for the download (default: system temp folder).
      workDir?: () => string;
      portableExe?: () => string | undefined;
      quit?: () => void;
      platform?: NodeJS.Platform;
      // Tests only: accept http://127.0.0.1 download addresses.
      insecure?: boolean;
      parts?: number;
      // Tests only: process start and the wait for the new version.
      spawn?: typeof spawn;
      handoffWait?: number;
    } = {},
  ) {
    super();
    this.state = { status: "idle", current };
  }
  configure(options: Updater["options"]) {
    this.options = { ...this.options, ...options };
  }
  private set(patch: Partial<UpdateState>) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.state);
  }
  schedule(enabled: () => boolean, firstDelay = 15000, every = 6 * 3600000) {
    clearTimeout(this.timer);
    const run = async () => {
      if (
        enabled() &&
        !["downloading", "ready", "installing"].includes(this.state.status)
      )
        await this.check().catch(() => {});
      this.timer = setTimeout(run, every);
      this.timer.unref?.();
    };
    this.timer = setTimeout(run, firstDelay);
    this.timer.unref?.();
  }
  stop() {
    clearTimeout(this.timer);
    clearTimeout(this.handoffTimer);
    this.download?.abort();
  }
  private platform() {
    return this.options.platform || process.platform;
  }
  private desktop() {
    return this.options.desktop?.() || path.join(os.homedir(), "Desktop");
  }
  private work() {
    return (
      this.options.workDir?.() || path.join(os.tmpdir(), "oyun-siralayici-guncelleme")
    );
  }
  async check() {
    if (["downloading", "installing"].includes(this.state.status)) return this.state;
    this.set({ status: "checking", error: undefined });
    try {
      const channel = this.options.channel || UPDATE_CHANNEL;
      const r = await fetch(channel, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": UA },
      });
      if (!r.ok) throw new Error(`Güncelleme kanalı HTTP ${r.status}`);
      const json = await r.json();
      const manifest = /telegra\.ph/.test(channel)
        ? manifestFromTelegraph(json)
        : parseManifest(json, this.options.insecure);
      this.manifest = manifest;
      const newer = compareVersions(manifest.version, this.state.current) > 0;
      const asset = manifest.assets[0];
      // A file downloaded and verified earlier is ready at once (Desktop first,
      // then the private folder).
      let file: string | undefined;
      if (newer && asset)
        for (const candidate of [
          path.join(this.desktop(), asset.name),
          path.join(this.work(), asset.name),
        ])
          if (fs.existsSync(candidate) && (await this.verifyFile(candidate, asset))) {
            file = candidate;
            break;
          }
      this.set({
        status: !newer ? "current" : file ? "ready" : "available",
        latest: manifest.version,
        date: manifest.date,
        notes: manifest.notes,
        size: asset?.transferSize || asset?.size,
        file,
        progress: file ? 1 : undefined,
        phase: undefined,
        speed: undefined,
        checkedAt: new Date().toISOString(),
        canInstall: this.platform() === "win32",
        error:
          newer && !asset
            ? "Yeni sürüm var ama indirme bağlantısı henüz eklenmemiş."
            : undefined,
      });
    } catch (e) {
      this.set({
        status: "error",
        error: (e as Error).message,
        checkedAt: new Date().toISOString(),
      });
    }
    return this.state;
  }
  private async verifyFile(file: string, asset: UpdateAsset) {
    try {
      if (fs.statSync(file).size !== asset.size) return false;
      const hash = crypto.createHash("sha256");
      await pipeline(fs.createReadStream(file), hash);
      return hash.digest("hex") === asset.sha256;
    } catch {
      return false;
    }
  }
  async start() {
    if (this.state.status === "downloading") return this.state;
    if (!this.manifest) await this.check();
    const asset = this.manifest?.assets[0];
    if (!asset || compareVersions(this.manifest!.version, this.state.current) <= 0)
      throw new Error("İndirilecek yeni sürüm yok.");
    const work = this.work();
    fs.mkdirSync(work, { recursive: true });
    const gzip = asset.encoding === "gzip";
    const raw = path.join(work, asset.name + (gzip ? ".gz" : "") + ".part"),
      exe = path.join(work, asset.name);
    const controller = new AbortController();
    this.download = controller;
    this.set({
      status: "downloading",
      phase: "download",
      progress: 0,
      received: 0,
      speed: undefined,
      error: undefined,
      note: undefined,
    });
    let lastError = "";
    for (const url of asset.urls) {
      try {
        await this.fetchFile(
          url,
          raw,
          gzip ? asset.transferSize : asset.size,
          controller.signal,
        );
        this.set({ phase: "verify", progress: 1, speed: undefined });
        await this.unpack(raw, exe, asset, gzip);
        fs.rmSync(raw, { force: true });
        const placed = await this.place(exe, path.join(this.desktop(), asset.name));
        this.set({
          status: "ready",
          phase: undefined,
          progress: 1,
          speed: undefined,
          file: placed,
          note:
            placed === exe
              ? "Masaüstüne kopyalanamadı (başka bir program dosyayı tutuyor olabilir); güncelleme geçici klasördeki doğrulanmış kopyayla yapılacak."
              : undefined,
        });
        return this.state;
      } catch (e) {
        fs.rmSync(raw, { force: true });
        if (controller.signal.aborted) {
          this.set({
            status: "available",
            phase: undefined,
            progress: undefined,
            received: undefined,
            speed: undefined,
          });
          return this.state;
        }
        const message = (e as Error).message || String(e);
        lastError =
          /terminated|other side closed|socket|ECONNRESET|ETIMEDOUT|network/i.test(
            message,
          )
            ? "sunucu bağlantıyı tekrar tekrar kesti (" + message + ")"
            : message;
      }
    }
    this.set({
      status: "error",
      phase: undefined,
      progress: undefined,
      speed: undefined,
      error: `İndirme tamamlanamadı: ${lastError}. “Yeniden dene” ile tekrar başlatabilirsin; bağlantının süresi dolduysa bir sonraki yayında yenilenir.`,
    });
    return this.state;
  }
  cancel() {
    this.download?.abort();
  }
  // Network → private file, as fast as possible (no unpacking on the way).
  private async fetchFile(
    url: string,
    file: string,
    expected: number | undefined,
    signal: AbortSignal,
  ) {
    let total = expected || 0,
      ranges = false;
    try {
      const probe = await fetch(url, {
        headers: { Range: "bytes=0-0", "User-Agent": UA },
        signal,
        redirect: "follow",
      });
      const length = Number(
        probe.headers.get("content-range")?.match(/\/(\d+)\s*$/)?.[1],
      );
      if (probe.status === 206 && length > 0) {
        ranges = true;
        total = length;
      }
      await probe.body?.cancel().catch(() => {});
    } catch (e) {
      if (signal.aborted) throw e;
    }
    if (expected && total !== expected)
      throw new Error("Sunucudaki dosyanın boyutu beklenenden farklı.");
    let got = 0,
      lastAt = Date.now(),
      lastGot = 0,
      speed = 0;
    const tick = setInterval(() => {
      const now = Date.now();
      const rate = ((got - lastGot) * 1000) / Math.max(1, now - lastAt);
      speed = speed ? speed * 0.6 + rate * 0.4 : rate;
      lastAt = now;
      lastGot = got;
      this.set({
        progress: total ? Math.min(0.999, got / total) : undefined,
        received: got,
        speed: Math.round(speed),
      });
    }, 400);
    const whole = async () => {
      // Without ranges a dropped connection can only start again from 0.
      for (let attempt = 1; ; attempt++) {
        got = 0;
        const fh = await fs.promises.open(file, "w");
        try {
          await this.segment(
            url,
            fh,
            0,
            total && ranges ? total - 1 : -1,
            signal,
            (n) => (got += n),
            !ranges,
          );
          if (!total || got === total || ranges) return;
          throw new Error("Bağlantı erken kapandı.");
        } catch (e) {
          if (signal.aborted || ranges || attempt >= 3) throw e;
          await sleep(1000 * attempt);
        } finally {
          await fh.close();
        }
      }
    };
    try {
      const count = Math.max(1, this.options.parts ?? PARTS);
      if (ranges && count > 1 && total > 8 * 1024 * 1024) {
        // Parts share one file; a part that fails for good stops the others
        // and the download falls back to a single connection once.
        const local = new AbortController();
        const stop = () => local.abort();
        signal.addEventListener("abort", stop, { once: true });
        const fh = await fs.promises.open(file, "w");
        try {
          const size = Math.ceil(total / count);
          await Promise.all(
            Array.from({ length: count }, (_, i) =>
              this.segment(
                url,
                fh,
                i * size,
                Math.min(total, (i + 1) * size) - 1,
                local.signal,
                (n) => (got += n),
              ).catch((e) => {
                local.abort();
                throw e;
              }),
            ),
          );
        } catch (e) {
          if (signal.aborted) throw e;
          await fh.close().catch(() => {});
          await whole();
        } finally {
          signal.removeEventListener("abort", stop);
          await fh.close().catch(() => {});
        }
      } else await whole();
    } finally {
      clearInterval(tick);
    }
    if (total && got !== total) throw new Error("İndirilen bölümler eksik.");
  }
  // One byte range (end = -1: until the server closes). A dropped connection
  // continues from where it stopped; it gives up only after several attempts
  // in a row that brought no data at all.
  private async segment(
    url: string,
    fh: fs.promises.FileHandle,
    start: number,
    end: number,
    signal: AbortSignal,
    count: (n: number) => void,
    whole = false,
  ) {
    let pos = start,
      failures = 0;
    while (end < 0 || pos <= end) {
      const before = pos;
      try {
        const headers: Record<string, string> = { "User-Agent": UA };
        if (!whole) headers.Range = `bytes=${pos}-${end < 0 ? "" : end}`;
        const r = await fetch(url, { headers, signal, redirect: "follow" });
        // Some servers answer a range that starts at 0 with the whole file (200);
        // that is fine from the start of the file, never in the middle.
        const accepted = whole
          ? r.ok
          : r.status === 206 || (r.status === 200 && pos === 0);
        if (!r.body || !accepted) throw new Error(`HTTP ${r.status}`);
        for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
          if (end >= 0 && pos + chunk.length > end + 1)
            throw new Error("Sunucu fazla veri gönderdi.");
          await fh.write(chunk, 0, chunk.length, pos);
          pos += chunk.length;
          count(chunk.length);
        }
        if (whole || end < 0) return;
        if (pos <= end) throw new Error("Bağlantı erken kapandı.");
      } catch (e) {
        if (signal.aborted) throw e;
        // A whole-file stream cannot resume in the middle.
        if (whole) throw e;
        failures = pos > before ? 0 : failures + 1;
        if (failures > 6) throw e;
        await sleep(failures ? Math.min(5000, 500 * failures) : 150);
      }
    }
  }
  // Private file → verified EXE (gzip unpacked on the way), then size + SHA-256.
  private async unpack(raw: string, exe: string, asset: UpdateAsset, gzip: boolean) {
    const temp = exe + ".dogrulaniyor";
    const hash = crypto.createHash("sha256");
    let written = 0;
    try {
      await pipeline([
        fs.createReadStream(raw),
        ...(gzip ? [zlib.createGunzip()] : []),
        new Transform({
          transform(chunk: Buffer, _e, done) {
            written += chunk.length;
            if (written > asset.size) return done(new Error("Dosya beklenenden büyük."));
            hash.update(chunk);
            done(null, chunk);
          },
        }),
        fs.createWriteStream(temp),
      ] as any);
      if (written !== asset.size || hash.digest("hex") !== asset.sha256)
        throw new Error("İndirilen dosya doğrulanamadı (boyut veya SHA-256 tutmadı)");
      await this.retry(() => {
        fs.rmSync(exe, { force: true });
        fs.renameSync(temp, exe);
      });
    } finally {
      fs.rmSync(temp, { force: true });
    }
  }
  private async retry(step: () => void | Promise<void>, times = 20) {
    for (let i = 0; ; i++)
      try {
        return await step();
      } catch (e) {
        if (i >= times || !busyError(e)) throw e;
        await sleep(500);
      }
  }
  // Verified EXE → Desktop. Returns where the EXE that will be started is.
  private async place(exe: string, target: string) {
    if (path.resolve(exe) === path.resolve(target)) return exe;
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await this.retry(() => fs.copyFileSync(exe, target));
      if (fs.statSync(target).size !== fs.statSync(exe).size)
        throw new Error("Kopya eksik.");
      fs.rmSync(exe, { force: true });
      return target;
    } catch {
      try {
        fs.rmSync(target, { force: true });
      } catch {
        /* the Desktop path itself is unusable */
      }
      return exe;
    }
  }
  // 2.0.5: no script and no console window (2.0.0–2.0.4 started cmd.exe, whose
  // tasklist/find/ping each opened a visible terminal and "find" could wait
  // for keyboard input forever). The verified new EXE is started directly as a
  // normal program. It waits until this app has closed (single-instance lock,
  // see main.ts), takes over and deletes the old EXE itself. This app stays
  // open ("Yeni sürüm açılıyor…") while the new one unpacks, and closes as soon
  // as the new one reports in with the token below — never leaving the user
  // with nothing on screen.
  async install() {
    // Already started (a second click before the window updated).
    if (this.state.status === "installing") return;
    if (this.state.status !== "ready" || !this.state.file)
      throw new Error("Önce güncellemeyi indir.");
    const file = this.state.file;
    if (!fs.existsSync(file)) {
      this.set({
        status: "error",
        error:
          "İndirilen dosya bulunamadı; bir güvenlik programı kaldırmış olabilir. “Yeniden dene” ile tekrar indir.",
        file: undefined,
      });
      throw new Error(this.state.error);
    }
    if (this.platform() !== "win32")
      throw new Error("Otomatik kurulum yalnız Windows'ta çalışır. Yeni EXE: " + file);
    const token = crypto.randomBytes(24).toString("hex");
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env))
      if (
        !/^(PORTABLE_EXECUTABLE_|CHROME_CRASHPAD_PIPE_NAME$|ELECTRON_RUN_AS_NODE$|OS_(PID|OLD|NEW)$|OYUN_GUNCELLEME$)/i.test(
          key,
        )
      )
        env[key] = value;
    env.OYUN_GUNCELLEME = JSON.stringify({
      token,
      eski: this.options.portableExe?.() || "",
      pid: process.pid,
    });
    try {
      const child = this.launch(file, env);
      await new Promise<void>((resolve, reject) => {
        child.once("spawn", () => resolve());
        child.once("error", reject);
      });
      child.unref();
    } catch (e: any) {
      this.set({
        note:
          `Yeni sürüm başlatılamadı (${e?.message || e}). ` +
          `Bu uygulamayı kapatıp ${file} dosyasını çift tıklayarak açabilirsin.`,
      });
      throw new Error(this.state.note);
    }
    this.handoffToken = token;
    this.set({ status: "installing", note: undefined, error: undefined });
    clearTimeout(this.handoffTimer);
    this.handoffTimer = setTimeout(() => {
      if (this.handoffToken !== token) return;
      this.set({
        note:
          "Yeni sürüm 2 dakikadır açılmadı. Bu uygulamayı kapat (tepsi simgesi → Çıkış), " +
          `sonra ${file} dosyasını çift tıklayarak aç.`,
      });
    }, this.options.handoffWait ?? 120000);
    this.handoffTimer.unref?.();
  }
  private launch(file: string, env: NodeJS.ProcessEnv) {
    return (this.options.spawn || spawn)(file, [], {
      cwd: path.dirname(file),
      detached: true,
      stdio: "ignore",
      env,
    });
  }
  // The new version reports in (second-instance with its token): close now.
  handoff(token: unknown) {
    if (!this.handoffToken || token !== this.handoffToken) return false;
    this.handoffToken = undefined;
    clearTimeout(this.handoffTimer);
    this.options.quit?.();
    return true;
  }
}
