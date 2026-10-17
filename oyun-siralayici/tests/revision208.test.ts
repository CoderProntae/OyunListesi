import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Service } from "../electron/service";
import { compatibility } from "../shared/compatibility";
import {
  researchProgress,
  researchStatus,
  runsHardwareStage,
} from "../shared/research-progress";
import { initialState, newGame } from "../shared/domain";
import { userChecksStage } from "../electron/research-plan";
import type { AppState, Game } from "../shared/types";

// 2.0.8: manual research — "AI'ya bırak" or the user's own Geçti / Geçmedi
// marks (the agent only explains them); a research whose results are all
// saved counts as done.
let root: string, service: Service;
const hardware = {
  ...initialState().hardware,
  os: "Windows 10",
  osVersion: "10.0.19045",
  cpu: "Intel Core i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 100,
};
// RAM is computed (16 > 8 → Geçmedi); the fixture GPU name is in no hardware
// data (2.1.0: real names like the 8800 GT are computed) → AI or the user decides.
const requirements = {
  minimum: { raw: "fixture", gpu: "Fixture GPU Z9", ramGB: 16, storageGB: 1 },
  recommended: { raw: "", availability: "not_published" as const },
};
function open(games: Partial<Game>[], settings: Partial<AppState["settings"]> = {}) {
  const state = initialState() as AppState;
  state.hardware = hardware as any;
  Object.assign(state.settings, { autoResearch: false, autoSummary: true }, settings);
  state.games = games.map((g, i) => ({
    ...newGame(g.name || "Oyun " + i, i),
    ...g,
  })) as any;
  fs.writeFileSync(path.join(root, "library.json"), JSON.stringify(state));
  service = new Service(root);
  return service.store.state.games;
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "oyun-208-"));
});
afterEach(async () => {
  await service?.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const marks = (id: string, status: Record<string, "pass" | "fail">) => ({
  [id]: Object.entries(status).map(([component, s]) => ({
    level: "minimum",
    component,
    status: s,
  })),
});
describe("the user's own marks", () => {
  it("win over computed rows, and stop counting when the row's values change", () => {
    const g = { ...newGame("X", 0), ...requirements } as any as Game;
    const before = compatibility(g, hardware as any);
    expect(before.minimum.find((r) => r.name === "RAM")?.status).toBe("fail");
    expect(before.minimum.find((r) => r.name === "GPU")?.status).toBe("unknown");
    const key = (component: string) =>
      before.minimum.find((r) => r.name === component)!.contextKey!;
    g.aiCompatibility = ["RAM", "GPU"].map((component) => ({
      level: "minimum" as const,
      component,
      status: "pass" as const,
      reason: "Senin kararın: Geçti.",
      contextKey: key(component),
      checkedAt: "2026-10-16T10:00:00Z",
      decidedBy: "user" as const,
    }));
    const after = compatibility(g, hardware as any);
    expect(after.minimum.find((r) => r.name === "RAM")).toMatchObject({
      status: "pass",
      user: true,
    });
    expect(after.minimum.find((r) => r.name === "GPU")).toMatchObject({
      status: "pass",
      user: true,
    });
    expect(researchProgress(g, hardware as any, false).complete).toBe(true);
    // More memory installed: the RAM row's inputs changed, the mark is old.
    const more = compatibility(g, { ...hardware, ramGB: 32 } as any);
    expect(more.minimum.find((r) => r.name === "RAM")).toMatchObject({ status: "pass" });
    expect(more.minimum.find((r) => r.name === "RAM")?.user).toBeUndefined();
  });
  it("the stage prompt lists the marks and forbids research", () => {
    const g = { ...newGame("Oyun", 0), id: "g1" } as Game;
    const { prompt } = userChecksStage(g, [
      { level: "minimum", component: "RAM", status: "pass" },
      { level: "minimum", component: "GPU", status: "fail" },
    ]);
    expect(prompt).toContain("AŞAMA: DONANIM (KULLANICI KARARI)");
    expect(prompt).toContain("Minimum RAM: Geçti (pass); Minimum GPU: Geçmedi (fail)");
    expect(prompt).toContain("araştırma yapma");
  });
});
describe("manual research choices", () => {
  it("'Kontrolleri sen seç': every row needs a mark; the marks are saved at once, undoably", async () => {
    const [g] = open([{ name: "Oyun", ...requirements } as any]);
    expect(runsHardwareStage(g, hardware as any, true, true)).toBe(true);
    await expect(
      service.call("researchGame", {
        id: g.id,
        checks: "user",
        decisions: marks(g.id, { RAM: "pass" }),
      }),
    ).rejects.toThrow("her satırı");
    await service.call("researchGame", {
      id: g.id,
      checks: "user",
      decisions: marks(g.id, { RAM: "pass", GPU: "fail", Disk: "pass" }),
    });
    const saved = service.store.requireGames([g.id])[0];
    expect(saved.research).toMatchObject({ userChecks: true, freshContext: true });
    expect(
      saved.aiCompatibility?.map((r) => [r.component, r.status, r.decidedBy, r.reason]),
    ).toEqual([
      ["RAM", "pass", "user", "Senin kararın: Geçti."],
      ["GPU", "fail", "user", "Senin kararın: Geçmedi."],
      ["Disk", "pass", "user", "Senin kararın: Geçti."],
    ]);
    expect(compatibility(saved, hardware as any).status).toBe("unsupported");
    service.store.undo();
    expect(service.store.requireGames([g.id])[0].aiCompatibility || []).toEqual([]);
  });
  it("'AI'ya bırak' removes earlier marks of the user; AI rows stay", async () => {
    const [g] = open([{ name: "Oyun", ...requirements } as any]);
    await service.call("researchGame", {
      id: g.id,
      checks: "user",
      decisions: marks(g.id, { RAM: "pass", GPU: "pass", Disk: "pass" }),
    });
    await service.call("stopResearch", {});
    await service.call("researchGame", { id: g.id, restart: true, checks: "ai" });
    const saved = service.store.requireGames([g.id])[0];
    expect(saved.aiCompatibility).toEqual([]);
    expect(saved.research?.userChecks).toBeUndefined();
  });
  it("Statistics: chosen games are researched again; a running one is refused", async () => {
    const games = open([
      { name: "A", research: { status: "done" } } as any,
      { name: "B" } as any,
      { name: "C" } as any,
    ]);
    // (A saved "running" becomes "queued" when the app starts.)
    games[1].research = { status: "running" };
    await expect(
      service.call("researchSelected", { ids: [games[0].id, games[1].id] }),
    ).rejects.toThrow("şu an araştırılıyor");
    await service.call("researchSelected", { ids: [games[0].id, games[2].id] });
    const [a, , c] = service.store.state.games;
    expect(a.research).toMatchObject({ freshContext: true });
    expect(c.research).toMatchObject({ freshContext: true });
    expect(["queued", "waiting_model"]).toContain(a.research?.status);
  });
});
describe("stopped research with every result saved is done", () => {
  it("derived status, and settled when the app starts", async () => {
    const summary = "Kısa Türkçe özet.";
    const complete = {
      name: "Tam",
      aiSummary: summary,
      research: { status: "cancelled" },
    };
    const missing = { name: "Eksik", research: { status: "cancelled" } };
    const failed = {
      name: "Hata",
      aiSummary: summary,
      research: { status: "error", message: "x" },
    };
    const g = {
      ...newGame("Tam", 0),
      aiSummary: summary,
      research: { status: "cancelled" },
    } as Game;
    expect(researchStatus(g, hardware as any, true)).toBe("done");
    expect(
      researchStatus({ ...g, aiSummary: undefined } as Game, hardware as any, true),
    ).toBe("cancelled");
    const games = open([complete as any, missing as any, failed as any]);
    expect(games.map((x) => x.research?.status)).toEqual(["done", "cancelled", "done"]);
    expect(games[0].research?.message).toBe("Araştırma sonuçları kaydedildi.");
  });
});
