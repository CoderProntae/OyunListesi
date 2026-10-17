import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import type { AddressInfo } from "node:net";
import { Store } from "../electron/store";
import { Updater } from "../electron/updater";

// 2.0.2: parallel download into a private folder, verification, safe copy to
// the Desktop; the split chat view keeps two different chats.
let root: string;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/202-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function server(
  body: Buffer,
  o: {
    ranges?: boolean;
    failOnce?: boolean;
    fullAs200?: boolean;
    parts?: number;
    cutEvery?: number;
    cutFirstWhole?: boolean;
  } = {},
) {
  const seen: string[] = [];
  let failed = false,
    wholeCut = false;
  const s = http.createServer((req, res) => {
    if (req.url === "/manifest") return res.end(JSON.stringify((s as any).manifest));
    if (req.url !== "/file") {
      res.statusCode = 404;
      return res.end();
    }
    const range = req.headers.range;
    seen.push(range || "whole");
    if (o.ranges && range) {
      const [, a, b] = range.match(/bytes=(\d+)-(\d*)/)!;
      const start = Number(a),
        end = b ? Number(b) : body.length - 1;
      // Like the real host: a range covering the whole file comes back as 200.
      if (o.fullAs200 && start === 0 && end >= body.length - 1) {
        res.setHeader("Content-Length", body.length);
        return res.end(body);
      }
      // One part breaks off half-way once; it must continue where it stopped.
      if (o.failOnce && !failed && start > 0 && end - start > 1000) {
        failed = true;
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${body.length}`,
          "Content-Length": end - start + 1,
        });
        res.write(body.subarray(start, start + 1000));
        return res.destroy();
      }
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${body.length}`,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      });
      // Like the real host's time limit: every connection is cut after a while.
      if (o.cutEvery && end - start + 1 > o.cutEvery) {
        res.write(body.subarray(start, start + o.cutEvery));
        setTimeout(() => res.destroy(), 5);
        return;
      }
      return res.end(body.subarray(start, end + 1));
    }
    res.setHeader("Content-Length", body.length);
    if (o.cutFirstWhole && !wholeCut && !range) {
      wholeCut = true;
      res.write(body.subarray(0, 100_000));
      setTimeout(() => res.destroy(), 5);
      return;
    }
    res.end(body);
  });
  return { s, seen };
}
async function listen(s: http.Server) {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return (s.address() as AddressInfo).port;
}
const exe = crypto.randomBytes(12_000_000);
const sha = crypto.createHash("sha256").update(exe).digest("hex");
describe("2.0.2 update download", () => {
  for (const [label, o, gzip] of [
    ["4 parts at once (server allows ranges)", { ranges: true }, false],
    ["4 parts, gzip-compressed file", { ranges: true }, true],
    [
      "a part that breaks off continues where it stopped",
      { ranges: true, failOnce: true },
      false,
    ],
    ["one connection when the server has no ranges", { ranges: false }, false],
    [
      "one ranged connection when the host answers the whole range with 200",
      { ranges: true, fullAs200: true, parts: 1 },
      false,
    ],
    // 2.0.3: the host cuts every connection; parts continue until complete.
    [
      "connections cut again and again (host time limit) still finish",
      { ranges: true, cutEvery: 400_000 },
      false,
    ],
    [
      "no ranges: a cut whole download starts again and finishes",
      { ranges: false, cutFirstWhole: true },
      false,
    ],
  ] as const)
    it(label, async () => {
      const payload = gzip ? zlib.gzipSync(exe) : exe;
      const { s, seen } = server(payload, o);
      const port = await listen(s);
      try {
        (s as any).manifest = {
          channel: "oyun-siralayici",
          version: "9.1.0",
          notes: "x",
          assets: [
            {
              name: "Oyun-Siralayici-9.1.0-Portable.exe",
              size: exe.length,
              sha256: sha,
              urls: [`http://127.0.0.1:${port}/file`],
              ...(gzip ? { encoding: "gzip", transferSize: payload.length } : {}),
            },
          ],
        };
        const desktop = path.join(root, "Desktop"),
          work = path.join(root, "work");
        const phases = new Set<string>();
        const u = new Updater("2.0.1", {
          channel: `http://127.0.0.1:${port}/manifest`,
          desktop: () => desktop,
          workDir: () => work,
          insecure: true,
          platform: "linux",
          parts: (o as any).parts,
        });
        u.on("state", (st) => st.phase && phases.add(st.phase));
        await u.check();
        const done = await u.start();
        expect(done.status).toBe("ready");
        expect(done.file).toBe(path.join(desktop, "Oyun-Siralayici-9.1.0-Portable.exe"));
        expect(fs.readFileSync(done.file!).equals(exe)).toBe(true);
        expect([...phases]).toEqual(["download", "verify"]);
        // Nothing is left behind in the private folder.
        expect(fs.readdirSync(work)).toEqual([]);
        if (o.ranges && !(o as any).parts)
          expect(
            seen.filter((r) => r !== "bytes=0-0" && r.startsWith("bytes=")).length,
          ).toBeGreaterThanOrEqual(4);
        else if (o.ranges) expect(seen).toContain(`bytes=0-${payload.length - 1}`);
        else expect(seen).toContain("whole");
        // Started again later: the verified file is found and ready at once.
        const again = new Updater("2.0.1", {
          channel: `http://127.0.0.1:${port}/manifest`,
          desktop: () => desktop,
          workDir: () => work,
          insecure: true,
        });
        expect((await again.check()).status).toBe("ready");
      } finally {
        s.close();
      }
    });
  it("a Desktop that cannot be written keeps the verified copy and still installs from it", async () => {
    const { s } = server(exe, { ranges: true });
    const port = await listen(s);
    try {
      (s as any).manifest = {
        channel: "oyun-siralayici",
        version: "9.2.0",
        notes: "x",
        assets: [
          {
            name: "Oyun-Siralayici-9.2.0-Portable.exe",
            size: exe.length,
            sha256: sha,
            urls: [`http://127.0.0.1:${port}/file`],
          },
        ],
      };
      const blocked = path.join(root, "not-a-folder");
      fs.writeFileSync(blocked, "x");
      const work = path.join(root, "work");
      const u = new Updater("2.0.1", {
        channel: `http://127.0.0.1:${port}/manifest`,
        desktop: () => blocked,
        workDir: () => work,
        insecure: true,
        platform: "linux",
      });
      await u.check();
      const done = await u.start();
      expect(done.error).toBeUndefined();
      expect(done.status).toBe("ready");
      expect(done.file).toBe(path.join(work, "Oyun-Siralayici-9.2.0-Portable.exe"));
      expect(done.note).toMatch(/Masaüstüne kopyalanamadı/);
      expect(fs.readFileSync(done.file!).equals(exe)).toBe(true);
      // A file removed by another program is reported, not silently ignored.
      fs.rmSync(done.file!);
      await expect(u.install()).rejects.toThrow(/bulunamadı/);
      expect(u.state.status).toBe("error");
    } finally {
      s.close();
    }
  });
  it("a wrong checksum is an error that stays, and the partial file is removed", async () => {
    const { s } = server(exe, { ranges: true });
    const port = await listen(s);
    try {
      (s as any).manifest = {
        channel: "oyun-siralayici",
        version: "9.3.0",
        notes: "x",
        assets: [
          {
            name: "Oyun-Siralayici-9.3.0-Portable.exe",
            size: exe.length,
            sha256: "c".repeat(64),
            urls: [`http://127.0.0.1:${port}/file`],
          },
        ],
      };
      const desktop = path.join(root, "Desktop"),
        work = path.join(root, "work");
      const u = new Updater("2.0.1", {
        channel: `http://127.0.0.1:${port}/manifest`,
        desktop: () => desktop,
        workDir: () => work,
        insecure: true,
      });
      await u.check();
      const r = await u.start();
      expect(r.status).toBe("error");
      expect(r.error).toMatch(/doğrulanamadı/);
      expect(
        fs.existsSync(path.join(desktop, "Oyun-Siralayici-9.3.0-Portable.exe")),
      ).toBe(false);
      expect(fs.readdirSync(work)).toEqual([]);
    } finally {
      s.close();
    }
  });
});

describe("2.0.2 two chats", () => {
  let store: Store;
  beforeEach(() => {
    store = new Store(path.join(root, "lib"));
  });
  afterEach(() => store.close());
  it("opens, picks, swaps and closes without ever showing one chat twice", () => {
    const a = store.createChat(),
      b = store.createChat(),
      c = store.createChat();
    expect(store.state.activeChatId).toBe(c.id);
    // Open: the newest other chat goes under the active one.
    store.chatSplit("open", {});
    expect(store.state.settings.chatSplit.chatId).toBe(b.id);
    // Picking the lower chat for the top pane swaps the two.
    store.chatSplit("pick", { chatId: b.id, slot: "top" });
    expect([store.state.activeChatId, store.state.settings.chatSplit.chatId]).toEqual([
      b.id,
      c.id,
    ]);
    store.chatSplit("pick", { chatId: a.id, slot: "bottom" });
    expect(store.state.settings.chatSplit.chatId).toBe(a.id);
    store.chatSplit("ratio", { ratio: 0.3 });
    expect(store.state.settings.chatSplit.ratio).toBe(0.3);
    expect(() => store.chatSplit("ratio", { ratio: 0.95 })).toThrow();
    // Deleting the top chat moves the lower one up and ends the split.
    store.deleteChats([b.id]);
    expect(store.state.activeChatId).toBe(a.id);
    expect(store.state.settings.chatSplit.chatId).toBeNull();
    store.chatSplit("open", { chatId: c.id });
    store.deleteChat(c.id);
    expect(store.state.settings.chatSplit.chatId).toBeNull();
    expect(store.state.activeChatId).toBe(a.id);
  });
  it("with a single chat, opening the split creates a new lower chat that is not activated", () => {
    const only = store.createChat();
    store.chatSplit("open", {});
    const lower = store.state.settings.chatSplit.chatId!;
    expect(lower).not.toBe(only.id);
    expect(store.state.activeChatId).toBe(only.id);
    expect(store.state.chats.map((c) => c.id)).toContain(lower);
    store.chatSplit("close", {});
    expect(store.state.settings.chatSplit.chatId).toBeNull();
  });
  it("loading drops a lower chat that no longer exists or equals the upper one", () => {
    const a = store.createChat();
    const state: any = store.exportState();
    state.settings.chatSplit = { chatId: a.id, ratio: 0.4 };
    expect(store.validate(state).settings.chatSplit.chatId).toBeNull();
    state.settings.chatSplit = { chatId: "missing", ratio: 0.4 };
    expect(store.validate(state).settings.chatSplit).toEqual({
      chatId: null,
      ratio: 0.4,
    });
  });
});
