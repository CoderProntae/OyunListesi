import si from "systeminformation";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as cheerio from "cheerio";
import { emptyHardware, now, uid } from "../shared/domain";
import type { Hardware } from "../shared/types";
function run(exe: string, args: string[], timeout = 18000) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, shell: false });
    let text = "";
    const t = setTimeout(() => {
      child.kill();
      reject(new Error("Donanım komutu zaman aşımı."));
    }, timeout);
    child.stdout?.on("data", (d) => {
      if (text.length < 200000) text += d.toString();
    });
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      code === 0
        ? resolve(text)
        : reject(new Error(`Donanım aracı ${code} koduyla kapandı.`));
    });
  });
}
const limit = <T>(p: Promise<T>, ms = 15000) =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Donanım sorgusu zaman aşımı.")), ms).unref(),
    ),
  ]);
export async function detectHardware(): Promise<Hardware> {
  if (process.platform !== "win32")
    return {
      ...emptyHardware,
      os: process.platform,
      detectedAt: now(),
      note: "Donanım algılama Windows masaüstü sürümünde çalışır. Tarayıcı/Linux önizlemesinde kendi bilgisayarını okumaz; değerleri elle girebilirsin.",
    };
  const [cpu, mem, graphics, system, disks] = await Promise.all([
    limit(si.cpu()),
    limit(si.mem()),
    limit(si.graphics()),
    limit(si.osInfo()),
    limit(si.fsSize()),
  ]);
  const cards = graphics.controllers || [];
  const gpu = [...cards].sort((a, b) => (b.vram || 0) - (a.vram || 0))[0];
  const volumes = disks.map((d) => ({
    name: d.mount || d.fs,
    freeGB: d.available / 1024 ** 3,
    sizeGB: d.size / 1024 ** 3,
  }));
  const drive = volumes.find((d) => /^c:/i.test(d.name)) || volumes[0];
  const result: Hardware = {
    ...emptyHardware,
    os: system.distro || "Windows",
    osVersion: system.release,
    architecture: system.arch,
    cpu: cpu.brand,
    cores: cpu.physicalCores,
    threads: cpu.cores,
    clockGHz: cpu.speed,
    gpu: gpu?.model || "",
    vramGB: gpu?.vram ? gpu.vram / 1024 : null,
    vramCertain: false,
    ramGB: Math.round((mem.total / 1024 ** 3) * 10) / 10,
    diskName: drive?.name || "",
    diskFreeGB: drive?.freeGB ?? null,
    gpuOptions: cards.map((g) => ({
      name: g.model,
      vramGB: g.vram ? g.vram / 1024 : null,
    })),
    disks: volumes,
    detectedAt: now(),
    manual: false,
    note: "CPU/RAM/disk sistemden okundu. VRAM ve grafik API özellikleri ayrıca doğrulanır; belirsiz alanlar uyumlulukta sarı gösterilir.",
  };
  const file = path.join(os.tmpdir(), `oyun-dx-${uid()}.xml`);
  try {
    await run("dxdiag.exe", ["/whql:off", "/x", file], 25000);
    const xml = await fs.readFile(file, "utf8");
    const $ = cheerio.load(xml, { xml: true });
    result.directXInstalled = $("SystemInformation > DirectXVersion").text();
    $("DisplayDevice").each((_, el) => {
      const name = $(el).find("CardName").text();
      if (
        !result.gpu ||
        name.toLowerCase().includes(result.gpu.toLowerCase()) ||
        result.gpu.toLowerCase().includes(name.toLowerCase())
      ) {
        const levels =
          $(el)
            .find("FeatureLevels")
            .text()
            .match(/\d+[_\.]\d+/g) || [];
        if (levels.length)
          result.directX = Math.max(...levels.map((x) => Number(x.replace("_", "."))));
        const vram = $(el)
          .find("DedicatedMemory")
          .text()
          .match(/([\d,.]+)\s*MB/i);
        if (vram) {
          const value = Number(vram[1].replace(/,/g, "")) / 1024;
          if (value > 0 && value < 200) {
            result.vramGB = value;
            result.vramCertain = true;
          }
        }
      }
    });
  } catch {
    result.note += " dxdiag doğrulaması alınamadı.";
  } finally {
    await fs.rm(file, { force: true }).catch(() => {});
  }
  try {
    const text = await run("vulkaninfo.exe", ["--summary"], 7000);
    result.vulkan =
      text.match(/Vulkan Instance Version:\s*([\d.]+)/i)?.[1] || "Bilinmiyor";
  } catch {
    result.vulkan = "Doğrulanamadı (vulkaninfo yok veya çalışmadı)";
  }
  return result;
}
