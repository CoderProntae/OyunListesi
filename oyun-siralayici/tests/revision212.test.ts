import { describe, expect, it } from "vitest";
import { initialState, newGame } from "../shared/domain";
import { compatibility, withRawFields } from "../shared/compatibility";
import { compareCpu } from "../shared/hardware-match";
import { gameSchema } from "../electron/validation";
import type { Hardware } from "../shared/types";
// 2.1.2: broken store lines ("64" as CPU, "10" as OS, an unlabeled
// recommended block) must compare correctly instead of going to the AI.
const pc: Hardware = {
  ...initialState().hardware,
  os: "Microsoft Windows 10 Pro",
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
  directX: 12.1,
};
describe("bare bit and version lines", () => {
  it('CPU "64" means 64-bit, not a score', () => {
    const v = compareCpu("64", pc);
    expect(v.status).toBe("pass");
    expect(v.reason).toContain("64 bit");
    expect(compareCpu("64-bit işlemci gerektirir", pc).status).toBe("pass");
  });
  it('CPU "32" asks a 32-bit CPU, which a 64-bit CPU runs', () => {
    expect(compareCpu("32", pc).status).toBe("pass");
  });
  it('OS "10" is Windows 10', () => {
    const g = { ...newGame("Bendy and the Ink Machine", 1), year: 2017 } as any;
    g.minimum = { raw: "", os: "10", cpu: "64" };
    g.recommended = { raw: "64-bit işlemci gerektirir" };
    const c = compatibility(g, pc);
    const os = c.minimum.find((r) => r.name === "İşletim sistemi");
    expect(os?.status).toBe("pass");
    const cpu = c.minimum.find((r) => r.name === "CPU");
    expect(cpu?.status).toBe("pass");
    expect(cpu?.reason).toContain("64 bit");
    // The unlabeled recommended block still gets its own row (2.1.2).
    const rec = c.recommended.find((r) => r.name === "CPU");
    expect(rec?.status).toBe("pass");
    expect(rec?.required).toBe("64-bit işlemci gerektirir");
  });
  it("withRawFields only fills what the block has no label for", () => {
    expect(withRawFields({ raw: "64-bit işlemci gerektirir" }).cpu).toBe(
      "64-bit işlemci gerektirir",
    );
    expect(withRawFields({ raw: "Windows 10\n8 GB RAM" }).os).toBe("Windows 10");
    expect(withRawFields({ raw: "Windows 10\n8 GB RAM" }).ramGB).toBe(8);
    const labeled = { raw: "çok eski", cpu: "Intel Core i5-4460" };
    expect(withRawFields(labeled)).toEqual(labeled);
  });
  it("games keep the manual verdict", () => {
    const g = gameSchema.parse({ ...newGame("X", 1), reqVerdict: "meets" });
    expect(g.reqVerdict).toBe("meets");
    expect(gameSchema.parse(newGame("X", 1)).reqVerdict).toBeUndefined();
  });
});
