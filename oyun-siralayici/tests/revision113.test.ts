import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Service } from "../electron/service";
import { Store } from "../electron/store";
import { Providers } from "../electron/providers";
import { researchStages } from "../electron/research-plan";
import {
  HLTB_RESTORE_MIGRATION,
  REQUIREMENTS_REPAIR_MIGRATION,
  STORE_REQUIREMENTS_MIGRATION,
  STORE_ONLY_MIGRATION,
  DLC_DATA_MIGRATION,
  OVERLAY_INTRO_MIGRATION,
  TITLE_SEARCH_MIGRATION,
  PCGW_MIGRATION,
  PCGW_INFO_MIGRATION,
  initialState,
  newGame,
} from "../shared/domain";

// 1.0.13: "Ne kadar sürer?" (HowLongToBeat) is back. Only the research stage that
// searched official language + HLTB stays removed. Times dropped by 1.0.12 are
// restored once from backups; games refreshed by 1.0.12 get a times-only refill.
let root: string;
const services: Service[] = [];
const times = (main: number) => ({
  status: "found" as const,
  main,
  mainExtra: main * 2,
  url: "https://howlongtobeat.com/game/62941",
  sourceUrl: "https://hltbapi.codepotatoes.de/hltb/62941",
  via: "HowLongToBeat · Codepotatoes topluluk API’si",
  checkedAt: "2026-10-01T10:00:00.000Z",
});
const hltbSource = {
  title: "HowLongToBeat · Codepotatoes topluluk API’si",
  url: "https://hltbapi.codepotatoes.de/hltb/62941",
  checkedAt: "2026-10-01T10:00:00.000Z",
  kind: "community",
  fields: ["hltb"],
};
const steamSource = {
  title: "Steam Store",
  url: "https://store.steampowered.com/app/1145360/",
  checkedAt: "2026-10-01T10:00:00.000Z",
  kind: "official",
};
// What 1.0.11 wrote (Turkish + times) and what 1.0.12 left of it.
function v111() {
  const state: any = initialState();
  delete state.notes;
  delete state.migrations;
  state.games = [
    {
      ...newGame("Hades", 0, 1145360),
      id: "hades",
      catalogCheckedAt: "2026-10-01T10:00:00.000Z",
      turkish: {
        official: true,
        interface: true,
        audio: false,
        subtitles: true,
        patch: "none",
        sources: [],
      },
      hltb: times(23.5),
      aiEditedFields: ["hltb.main", "turkish.patch", "year"],
      sources: [steamSource, hltbSource],
      tags: ["Rogue-lite"],
    },
    {
      ...newGame("Portal 2", 1, 620),
      id: "portal",
      catalogCheckedAt: "2026-10-01T10:00:00.000Z",
      turkish: {
        official: false,
        interface: false,
        audio: false,
        subtitles: false,
        patch: "none",
        sources: [],
      },
      hltb: times(8.5),
      sources: [hltbSource],
    },
    { ...newGame("Hiç süresi olmayan", 2), id: "never" },
  ];
  return state;
}
function v112() {
  const state = v111();
  state.notes = { hades: { text: "Kişisel not", updatedAt: "2026-10-15T20:00:00.000Z" } };
  state.games = state.games.map((g: any) => {
    const { turkish, hltb, ...rest } = g;
    return {
      ...rest,
      aiEditedFields: (g.aiEditedFields || []).filter(
        (f: string) => !/^(turkish|hltb)/.test(f),
      ),
      sources: g.sources.filter((s: any) => !s.fields?.includes("hltb")),
    };
  });
  return state;
}
const write = (name: string, data: unknown) =>
  fs.writeFileSync(path.join(root, name), JSON.stringify(data));
function service() {
  const s = new Service(root);
  services.push(s);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  return s;
}
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/113-"));
  fs.mkdirSync(path.join(root, "backups"), { recursive: true });
});
afterEach(async () => {
  for (const s of services) {
    s.queue.cancel();
    await s.call("stopResearch");
    s.close();
  }
  services.length = 0;
  await new Promise((r) => setTimeout(r, 10));
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

it("a library emptied by 1.0.12 gets its times, sources and AI markers back once from the backup", () => {
  const before = v111();
  write("backups/library-2026-10-15T20-00-00-000Z-yukseltme-oncesi.json", before);
  // A newer 1.0.12 daily backup has no times; it must not hide the older one.
  write("backups/library-2026-10-15T21-00-00-000Z.json", v112());
  write("library.json", v112());
  const backupsBefore = fs
    .readdirSync(path.join(root, "backups"))
    .map((n) => fs.readFileSync(path.join(root, "backups", n), "utf8"));
  const store = new Store(root);
  try {
    const [hades, portal, never] = store.state.games;
    expect(hades.hltb).toMatchObject({ status: "found", main: 23.5, mainExtra: 47 });
    expect(portal.hltb?.main).toBe(8.5);
    expect(never.hltb).toBeUndefined();
    expect(hades.sources.map((x) => x.title)).toEqual([
      steamSource.title,
      hltbSource.title,
    ]);
    expect(hades.aiEditedFields).toEqual(["year", "hltb.main"]);
    expect(hades).not.toHaveProperty("turkish");
    expect(hades.tags).toEqual(["Rogue-lite"]);
    expect(store.state.notes.hades.text).toBe("Kişisel not");
    expect(store.state.migrations).toContain(HLTB_RESTORE_MIGRATION);
    const disk = JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8"));
    expect(disk.games[0].hltb.main).toBe(23.5);
    expect(disk.migrations).toContain(HLTB_RESTORE_MIGRATION);
    for (const content of backupsBefore)
      expect(
        fs
          .readdirSync(path.join(root, "backups"))
          .some(
            (n) => fs.readFileSync(path.join(root, "backups", n), "utf8") === content,
          ),
      ).toBe(true);
  } finally {
    store.close();
  }
  // One-time: after the marker, a missing value is not refilled from backups again.
  const saved = JSON.parse(fs.readFileSync(path.join(root, "library.json"), "utf8"));
  delete saved.games[1].hltb;
  write("library.json", saved);
  const again = new Store(root);
  try {
    expect(again.state.games[1].hltb).toBeUndefined();
  } finally {
    again.close();
  }
});
it("current times always win and games without backed-up times stay empty", () => {
  write("backups/library-2026-10-15T20-00-00-000Z-yukseltme-oncesi.json", v111());
  const current = v112();
  current.games[1].hltb = { status: "not_found", checkedAt: "2026-10-16T08:00:00.000Z" };
  write("library.json", current);
  const store = new Store(root);
  try {
    expect(store.state.games[0].hltb?.main).toBe(23.5);
    expect(store.state.games[1].hltb).toEqual({
      status: "not_found",
      checkedAt: "2026-10-16T08:00:00.000Z",
    });
    expect(store.state.games[2].hltb).toBeUndefined();
  } finally {
    store.close();
  }
});
it("a 1.0.11 library keeps its times directly; only the Turkish data is dropped", () => {
  write("library.json", v111());
  const store = new Store(root);
  try {
    expect(store.state.games[0].hltb?.main).toBe(23.5);
    expect(store.state.games[0].aiEditedFields).toEqual(["hltb.main", "year"]);
    expect(store.state.games[0].sources).toHaveLength(2);
    expect(store.state.games[0]).not.toHaveProperty("turkish");
    expect(store.state.migrations).toContain(HLTB_RESTORE_MIGRATION);
    expect(store.backups().some((b) => b.name.endsWith("-yukseltme-oncesi.json"))).toBe(
      true,
    );
  } finally {
    store.close();
  }
});
it("new libraries are born marked and never scan backups", () => {
  const store = new Store(root);
  try {
    expect(store.state.migrations).toEqual([
      HLTB_RESTORE_MIGRATION,
      REQUIREMENTS_REPAIR_MIGRATION,
      STORE_REQUIREMENTS_MIGRATION,
      STORE_ONLY_MIGRATION,
      DLC_DATA_MIGRATION,
      OVERLAY_INTRO_MIGRATION,
      TITLE_SEARCH_MIGRATION,
      PCGW_MIGRATION,
      PCGW_INFO_MIGRATION,
    ]);
  } finally {
    store.close();
  }
});
it("restoring a 1.0.12 backup from the backup list also brings the times back", () => {
  write("backups/library-2026-10-15T20-00-00-000Z-yukseltme-oncesi.json", v111());
  write("backups/library-2026-10-15T21-00-00-000Z.json", v112());
  const store = new Store(root);
  try {
    store.restore("library-2026-10-15T21-00-00-000Z.json");
    expect(store.state.games.find((g) => g.id === "portal")?.hltb?.main).toBe(8.5);
    expect(store.state.notes.hades.text).toBe("Kişisel not");
  } finally {
    store.close();
  }
});
it("games refreshed by 1.0.12 get a background times-only refill that changes nothing else", async () => {
  const state: any = initialState();
  state.settings.autoResearch = true;
  state.settings.lmModel = "";
  state.games = [
    {
      ...newGame("Refreshed in 1.0.12", 0),
      id: "a",
      catalogCheckedAt: "2026-10-15T20:30:00.000Z",
      fetchStatus: "review",
    },
    { ...newGame("Has times", 1), id: "b", catalogCheckedAt: "x", hltb: times(3) },
    { ...newGame("Never fetched", 2), id: "c" },
  ];
  write("library.json", state);
  const enrich = vi.spyOn(Providers.prototype, "enrich");
  const refresh = vi
    .spyOn(Providers.prototype, "refreshTimes")
    .mockImplementation(async function (this: Providers, id: string) {
      const value = {
        status: "found" as const,
        main: 7,
        checkedAt: "2026-10-16T09:00:00.000Z",
      };
      this.store.metadata(id, { hltb: value });
      return value;
    });
  const s = new Service(root);
  services.push(s);
  const seenTimesOnly: boolean[] = [];
  const onChange = s.queue.onChange;
  s.queue.onChange = () => {
    seenTimesOnly.push(s.queue.state.timesOnly);
    onChange();
  };
  await vi.waitFor(() => expect(s.store.requireGames(["a"])[0].hltb?.main).toBe(7));
  await vi.waitFor(() => expect(s.queue.state.running).toBe(false));
  expect(refresh.mock.calls.map((c) => c[0])).toEqual(["a"]);
  expect(enrich).not.toHaveBeenCalled();
  expect(seenTimesOnly).toContain(true);
  const [a, b, c] = s.store.state.games;
  expect(a.fetchStatus).toBe("review");
  expect(a.research).toBeUndefined();
  expect(b.hltb?.main).toBe(3);
  expect(c.hltb).toBeUndefined();
});
it("offline at start: nothing is marked failed and the refill is retried on the next start", async () => {
  const state: any = initialState();
  state.games = ["A", "B", "C"].map((name, i) => ({
    ...newGame(name, i),
    id: name.toLowerCase(),
    catalogCheckedAt: "2026-10-15T20:30:00.000Z",
  }));
  write("library.json", state);
  const refresh = vi
    .spyOn(Providers.prototype, "refreshTimes")
    .mockResolvedValue("offline");
  const first = new Service(root);
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(first.queue.state.running).toBe(false));
  // The other two waiting lookups were dropped instead of failing one by one.
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(first.queue.state).toMatchObject({ total: 1, done: 1, errors: 0 });
  expect(first.store.state.games.every((g) => g.hltb === undefined)).toBe(true);
  first.close();
  refresh.mockReset();
  refresh.mockImplementation(async function (this: Providers, id: string) {
    const value = {
      status: "found" as const,
      main: 4,
      checkedAt: "2026-10-16T09:00:00.000Z",
    };
    this.store.metadata(id, { hltb: value });
    return value;
  });
  const second = new Service(root);
  services.push(second);
  await vi.waitFor(
    () => expect(second.store.state.games.map((g) => g.hltb?.main)).toEqual([4, 4, 4]),
    { timeout: 5000 },
  );
});
it("a full refresh upgrades a waiting times-only job; stopping leaves times-only games untouched", async () => {
  const state: any = initialState();
  state.games = ["A", "B", "C"].map((name, i) => ({
    ...newGame(name, i),
    id: name.toLowerCase(),
    fetchStatus: "review",
  }));
  write("library.json", state);
  const s = new Service(root);
  services.push(s);
  vi.spyOn(s.providers, "refreshTimes").mockImplementation(
    (_id: string, signal?: AbortSignal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        }),
      ),
  );
  s.queue.addTimes(["a", "b", "c"]);
  await vi.waitFor(() => expect(s.queue.state.current).toBe("a"));
  expect(s.queue.state.timesOnly).toBe(true);
  s.queue.add(["c"], true);
  expect(s.queue.jobs.find((j) => j.id === "c")).toMatchObject({
    times: false,
    force: true,
  });
  expect(s.store.requireGames(["c"])[0].fetchStatus).toBe("queued");
  s.queue.cancel();
  await vi.waitFor(() => expect(s.queue.state.running).toBe(false));
  const [a, b, c] = s.store.state.games;
  expect(a.fetchStatus).toBe("review");
  expect(b.fetchStatus).toBe("review");
  expect(c.fetchStatus).toBe("idle");
});
it("durations are back as data while automatic research still has only two stages", () => {
  expect(researchStages(true)).toEqual(["hardware", "summary"]);
  expect(researchStages(false)).toEqual(["hardware"]);
});
