// 2.1.0: measures how much of real store requirement text the hardware
// comparison can decide by itself (dev tool, not part of the app).
// Data: Kaggle "Steam System Requirement" dataset (raghadalmalki), CSV path
// as argument. Usage: npx tsx scripts/hardware-coverage.ts .cache/steam_dataset.csv
import fs from "node:fs";
import { compareCpu, compareGpu } from "../shared/hardware-match";
import type { Hardware } from "../shared/types";

const file = process.argv[2] || ".cache/steam_dataset.csv";
const text = fs.readFileSync(file, "utf8");
const rows: string[][] = [];
{
  let row: string[] = [],
    cell = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') ((cell += '"'), i++);
      else q = false;
    } else if (c === '"') q = true;
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\n") (row.push(cell), rows.push(row), (row = []), (cell = ""));
    else if (c !== "\r") cell += c;
  }
}
const head = rows[0];
const at = (name: string) => head.indexOf(name);
const h: Hardware = {
  os: "Windows 10 Pro",
  osVersion: "10.0.19045",
  architecture: "x64",
  cpu: "Intel(R) Core(TM) i5-4460 CPU @ 3.20GHz",
  cores: 4,
  threads: 4,
  clockGHz: 3.2,
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  vramGB: 6,
  vramCertain: true,
  ramGB: 8,
  diskFreeGB: 200,
  diskName: "C:",
  directX: 12.1,
  directXInstalled: "12",
  vulkan: "",
  gpuOptions: [],
  disks: [],
  manual: false,
  note: "",
};
const tally = (
  label: string,
  values: [string, number][],
  compare: (t: string, y: number) => { status: string },
) => {
  const counts: Record<string, number> = {};
  const unknown = new Map<string, number>();
  for (const [t, y] of values) {
    const v = compare(t, y);
    counts[v.status] = (counts[v.status] || 0) + 1;
    if (v.status === "unknown") unknown.set(t, (unknown.get(t) || 0) + 1);
  }
  const total = values.length;
  const decided = total - (counts.unknown || 0);
  console.log(
    `${label}: ${total} satır · karar verildi ${decided} (%${((decided / total) * 100).toFixed(1)}) · geçti ${counts.pass || 0} · geçmedi ${counts.fail || 0} · belirsiz ${counts.unknown || 0}`,
  );
  if (process.argv.includes("--samples"))
    for (const [t, n] of [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 40))
      console.log(`   ${n}× ${t.slice(0, 140)}`);
};
const data = rows.slice(1).filter((r) => r.length >= head.length - 1);
const year = (r: string[]) => Number(String(r[at("years")]).match(/\d{4}/)?.[0]) || 0;
const pick = (col: string) =>
  data
    .map((r) => [r[at(col)]?.trim() || "", year(r)] as [string, number])
    .filter(([t]) => t && t.length > 1);
tally("CPU", pick("Processor_main"), (t, y) => compareCpu(t, h, y || undefined));
tally("GPU", pick("Graphics"), (t) => compareGpu(t, h));
