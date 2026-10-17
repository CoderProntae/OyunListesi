import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import Ajv from "ajv";
import { Service } from "../electron/service";
import { Store } from "../electron/store";
import { prepareResearch, preserveResearchFields } from "../electron/research";
import { nativeTools, toolSpecs } from "../electron/tools";
import {
  compatibility,
  compatibilityKey,
  componentCompatibilityKey,
} from "../shared/compatibility";
import { initialState, newGame } from "../shared/domain";
import { hasCompletionHours } from "../shared/catalog-state";
import { StoreCards } from "../src/components/Catalogs";
import { Context } from "../src/lib/context";
import type { Game } from "../shared/types";
let s: Service, root: string, id: string, chat: any, message: any;
const h = {
  ...initialState().hardware,
  cpu: "Core i5-4460",
  gpu: "GTX 1660 SUPER",
  ramGB: 8,
  diskFreeGB: 16,
};
const at = "2026-10-15T12:00:00Z";
const product = {
  name: "Steam",
  url: "https://store.steampowered.com/app/400/",
  verified: true,
};
beforeEach(() => {
  root = fs.mkdtempSync(path.resolve(".cache/109-"));
  s = new Service(root);
  s.store.settings({
    lmModel: "fixture",
    autoResearch: false,
    autoSummary: false,
    requireApproval: false,
  });
  s.store.hardware(h);
  vi.spyOn(s.queue, "add").mockImplementation(() => {});
  id = s.store.add([{ name: "Fixture" }]).added[0];
  s.store.metadata(id, {
    minimum: {
      raw: "Fixture",
      cpu: "Fixture CPU X1",
      gpu: "Fixture GPU Z9",
      ramGB: 1,
      storageGB: 7,
    },
  });
  chat = s.store.createChat();
  message = { id: "response", role: "assistant", createdAt: at, blocks: [] };
  chat.messages.push(message);
});
afterEach(async () => {
  s.close();
  await new Promise((r) => setTimeout(r, 5));
  fs.rmSync(root, { force: true, recursive: true });
  vi.restoreAllMocks();
});
const game = () => s.store.requireGames([id])[0];
const execute = (name: string, args: any) =>
  (s.agent as any).execute(chat, message, name, args, new AbortController().signal);
// 1.0.17: requirement values change only with store data; tests apply such a
// change directly, everything else goes through the agent.
const storeChange = (level: "minimum" | "recommended", value: any) => {
  const next: any = { ...game()[level] };
  for (const [k, v] of Object.entries(value)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  s.store.metadata(id, { [level]: next });
};
const patch = async (value: any) => {
  const { minimum, recommended, ...rest } = value;
  if (minimum) storeChange("minimum", minimum);
  if (recommended) storeChange("recommended", recommended);
  return Object.keys(rest).length
    ? execute("update_game_info", { gameId: id, patch: rest })
    : { ok: true };
};
const row = (component = "GPU") =>
  compatibility(game(), s.store.state.hardware).minimum.find(
    (r) => r.name === component,
  )!;
const rowOrNone = (component = "GPU") =>
  compatibility(game(), s.store.state.hardware).minimum.find((r) => r.name === component);
const record = (
  component = "GPU",
  status = "pass",
  contextKey = row(component).contextKey,
) =>
  execute("record_compatibility", {
    gameId: id,
    level: "minimum",
    component,
    status,
    contextKey,
    reason: "Deterministic fixture, not a performance claim",
  });
function card(g = game(), name = "Steam") {
  const html = renderToStaticMarkup(
    React.createElement(
      Context.Provider,
      { value: { run: async () => {}, modal: () => {} } as any },
      React.createElement(StoreCards, { game: g }),
    ),
  );
  const $ = load(html);
  return $(`[data-testid="catalog-${name}"]`);
}

it("A01: GPU result survives unrelated disk/RAM/CPU/other-level changes and reload", async () => {
  expect((await record()).applied).toBe(true);
  await patch({
    minimum: { storageGB: 8, ramGB: 2, cpu: "New CPU" },
    recommended: { gpu: "Other GPU" },
  });
  s.store.hardware({ diskFreeGB: 12, ramGB: 16, cpu: "Other actual CPU" });
  expect(row()).toMatchObject({ status: "pass", ai: true });
  s.store.flush();
  const reloaded = new Store(root);
  try {
    expect(
      compatibility(reloaded.state.games[0], reloaded.state.hardware).minimum[1].ai,
    ).toBe(true);
  } finally {
    reloaded.close();
  }
});
it.each(["requirement", "hardware"])(
  "A01: relevant GPU %s change expires result",
  async (kind) => {
    await record();
    if (kind === "requirement") await patch({ minimum: { gpu: "Other GPU" } });
    else s.store.hardware({ gpu: "Other actual GPU" });
    expect(row()).toMatchObject({ status: "unknown" });
    expect(row().ai).toBeUndefined();
  },
);
it("A01: old global snapshots retain only still-matching component results", () => {
  s.store.metadata(id, {
    aiCompatibility: [
      {
        level: "minimum",
        component: "GPU",
        status: "pass",
        reason: "Old result",
        contextKey: compatibilityKey(game(), h),
        checkedAt: at,
      },
    ],
  });
  s.store.metadata(id, { minimum: { ...game().minimum, storageGB: 8 } });
  expect(row().ai).toBe(true);
  s.store.hardware({ gpu: "Changed GPU" });
  expect(row().ai).toBeUndefined();
});
it("A01: stale row key cannot save, unrelated row key stays valid", async () => {
  const key = row().contextKey;
  await patch({ minimum: { storageGB: 10 } });
  expect((await record("GPU", "pass", key)).ok).toBe(true);
  await patch({ minimum: { gpu: "Changed GPU" } });
  expect((await record("GPU", "pass", key)).error).toContain("değişti");
});
it("A01/A08: old global context input still works but saves a scoped key", async () => {
  expect((await record("GPU", "pass", compatibilityKey(game(), h))).applied).toBe(true);
  expect(game().aiCompatibility![0].contextKey).toBe(
    componentCompatibilityKey(game(), h, "minimum", "GPU"),
  );
});
it("A04: product write replaces stale negative check and renders product button", async () => {
  s.store.metadata(id, {
    storeChecks: [{ store: "Steam", status: "not_found", checkedAt: at, source: "Old" }],
  });
  expect((await patch({ stores: [product] })).ok).toBe(true);
  expect(card().find(".badge").text()).toBe("Var");
  expect(card().find(".catalog-card-content button")).toHaveLength(1);
  expect(game().storeChecks![0].status).toBe("found");
  const preserved = preserveResearchFields(game(), {
    stores: [],
    storeChecks: [
      { store: "Steam", status: "not_found", checkedAt: at, source: "Provider" },
    ],
  });
  expect(
    card({ ...game(), ...preserved })
      .find(".badge")
      .text(),
  ).toBe("Var");
});
it("A04: explicit store check writes and independent store statuses work", async () => {
  await patch({
    stores: [
      product,
      { name: "GOG", url: "https://www.gog.com/en/game/fixture", verified: true },
    ],
  });
  expect(
    (
      await patch({
        storeChecks: [
          { store: "Steam", status: "not_found", checkedAt: at, source: "AI" },
        ],
      })
    ).ok,
  ).toBe(true);
  expect(card().find(".badge").text()).toBe("Bulunamadı");
  expect(card().find(".catalog-card-content button")).toHaveLength(0);
  expect(card(game(), "GOG").find(".badge").text()).toBe("Var");
  await patch({
    storeChecks: [
      { store: "Steam", status: "found", url: product.url, checkedAt: at, source: "AI" },
    ],
  });
  expect(card().find(".catalog-card-content button")).toHaveLength(1);
});
it("A04: legacy AI product newer than negative check is displayed, newer negative still wins", () => {
  s.store.metadata(id, {
    stores: [product],
    aiEditedFields: ["stores"],
    aiEditedAt: "2026-10-15T15:00:00Z",
    storeChecks: [{ store: "Steam", status: "not_found", checkedAt: at, source: "Old" }],
  });
  expect(card().find(".badge").text()).toBe("Var");
  s.store.metadata(id, {
    storeChecks: [
      {
        store: "Steam",
        status: "not_found",
        checkedAt: "2026-10-16T12:00:00Z",
        source: "Newer",
      },
    ],
  });
  expect(card().find(".catalog-card-content button")).toHaveLength(0);
});
it("A04: search links never become found product buttons", async () => {
  await patch({
    stores: [{ ...product, url: "https://store.steampowered.com/search/?term=fixture" }],
  });
  expect(card().find(".catalog-card-content button")).toHaveLength(0);
  expect(game().storeChecks![0].status).toBe("review");
  expect(
    (
      await patch({
        storeChecks: [
          {
            store: "Steam",
            status: "found",
            url: "https://store.steampowered.com/search/",
            checkedAt: at,
            source: "AI",
          },
        ],
      })
    ).error,
  ).toContain("ürün");
});
it("A05: true partial HLTB update retains other hours, sources and dates; undo/reload", async () => {
  s.store.metadata(id, {
    hltb: {
      status: "found",
      main: 5,
      mainExtra: 10,
      completionist: 20,
      sourceUpdatedAt: at,
      url: "https://howlongtobeat.com/game/1",
      checkedAt: at,
    },
  });
  expect((await patch({ hltb: { main: 6 } })).ok).toBe(true);
  expect(game().hltb).toMatchObject({
    main: 6,
    mainExtra: 10,
    completionist: 20,
    sourceUpdatedAt: at,
  });
  s.store.flush();
  const reloaded = new Store(root);
  try {
    expect(reloaded.state.games[0].hltb?.mainExtra).toBe(10);
  } finally {
    reloaded.close();
  }
  s.store.undo();
  expect(game().hltb?.main).toBe(5);
});
it("A05: transient HLTB failure preserves previous hours", async () => {
  await patch({ hltb: { main: 6, status: "found" } });
  await patch({ hltb: { status: "unavailable", message: "Fixture offline" } });
  expect(game().hltb).toMatchObject({ main: 6, status: "unavailable" });
});
it("A06: group CRUD and series create/rename/dissolve work end-to-end and undo", async () => {
  const other = s.store.add([{ name: "Different title" }]).added[0];
  const group = await execute("create_group", { name: "New group" });
  expect(group.ok).toBe(true);
  await execute("move_to_group", { ids: [id, other], groupId: group.id });
  expect(game().groupIds).toEqual([group.id]);
  expect(
    (
      await execute("edit_group", {
        groupId: group.id,
        patch: { name: "Renamed", color: "#123456" },
      })
    ).ok,
  ).toBe(true);
  expect(s.store.state.groups.find((g) => g.id === group.id)?.name).toBe("Renamed");
  const series = await execute("create_series", { ids: [id, other], name: "New series" });
  expect(series.ok).toBe(true);
  await execute("rename_series", { seriesId: series.id, name: "Renamed series" });
  expect(s.store.state.series.find((r) => r.id === series.id)?.name).toBe(
    "Renamed series",
  );
  await execute("dissolve_series", { seriesId: series.id });
  expect(game().seriesId).toBeUndefined();
  s.store.undo();
  expect(game().seriesId).toBe(series.id);
  await execute("delete_group", { groupId: group.id });
  expect(game().groupIds).toEqual([]);
  expect(s.store.state.games).toHaveLength(2);
  s.store.undo();
  expect(game().groupIds).toEqual([group.id]);
});
it("A06: new mutation tools honor approval/denial and validate before mutation", async () => {
  const old = structuredClone(s.store.state.groups);
  expect(
    (await execute("create_group", { name: "Bad", color: "invalid" })).error,
  ).toBeTruthy();
  expect(
    (await execute("create_series", { name: "Bad", ids: [id, id] })).error,
  ).toBeTruthy();
  s.store.settings({ requireApproval: true });
  const pending = execute("create_group", { name: "Needs approval" });
  await vi.waitFor(() => expect(s.agent.permissions.size).toBe(1));
  const permission = [...s.agent.permissions.values()][0].request;
  expect(permission.mutation).toBe(true);
  expect(permission.description).toContain("oluşturulacak");
  s.agent.answerPermission(permission.id, "deny");
  expect((await pending).denied).toBe(true);
  expect(s.store.state.groups).toEqual(old);
});
it.each(["native", "json"] as const)(
  "A06/A07: new tools travel through %s agent loop",
  async (mode) => {
    s.store.settings({ toolMode: mode });
    let step = 0;
    vi.spyOn(s.lm, "stream").mockImplementation(async () => {
      const first = step++ === 0;
      return mode === "json"
        ? {
            text: JSON.stringify({
              message: "",
              tool_calls: first
                ? [{ name: "create_group", arguments: { name: "From JSON" } }]
                : [],
            }),
            thinking: "",
            calls: [],
          }
        : {
            text: "",
            thinking: "",
            calls: first
              ? [
                  {
                    id: "group-call",
                    name: "create_group",
                    arguments: '{"name":"From native"}',
                  },
                ]
              : [],
          };
    });
    await s.agent.send(chat.id, "Create a group.");
    await vi.waitFor(() => expect(s.agent.busy.size).toBe(0));
    expect(
      s.store.state.groups.some(
        (g) => g.name === (mode === "json" ? "From JSON" : "From native"),
      ),
    ).toBe(true);
  },
);
it("A07: all native schemas compile independently; validator constraints are advertised", () => {
  const ajv = new Ajv({ strict: false, validateFormats: false });
  for (const t of nativeTools)
    expect(() => ajv.compile(t.function.parameters)).not.toThrow();
  const schema = nativeTools.find((t) => t.function.name === "update_game_info")!.function
    .parameters;
  const validate = ajv.compile(schema);
  const valid = {
    gameId: id,
    patch: {
      hltb: { sourceUpdatedAt: at, main: 6 },
      stores: [{ ...product, source: "AI", checkedAt: at, priceUpdatedAt: at }],
    },
  };
  expect(validate(valid)).toBe(true);
  expect(toolSpecs.update_game_info.schema.safeParse(valid).success).toBe(true);
  const list = ajv.compile(toolSpecs.list_games.parameters);
  for (const limit of [0, 1, 100, 101])
    expect(list({ limit })).toBe(
      toolSpecs.list_games.schema.safeParse({ limit }).success,
    );
  expect(
    schema.properties.patch.properties.hltb.properties.sourceUpdatedAt,
  ).toBeDefined();
  // Requirements come only from the store: not advertised (2.0).
  expect(schema.properties.patch.properties.minimum).toBeUndefined();
  // The removed Turkish features are not advertised to the model at all.
  expect(schema.properties.patch.properties.turkish).toBeUndefined();
  expect(validate({ gameId: id, patch: { turkish: { patch: "verified" } } })).toBe(false);
});
it("A08 (2.1.0): a GPU row decided by the hardware data is not overridden by the AI", async () => {
  await patch({ minimum: { gpu: "GTX 1050" } });
  expect(row()).toMatchObject({ status: "pass", db: true });
  const result = await record("GPU", "fail");
  expect(result.error).toContain("donanım verisiyle");
  expect(row()).toMatchObject({ status: "pass", db: true });
  expect(row().ai).toBeUndefined();
  // The same answer as the data is accepted without saving anything.
  expect(await record("GPU", "pass", row().contextKey)).toMatchObject({
    ok: true,
    alreadyComputed: true,
    saved: false,
  });
  expect(game().aiCompatibility).toBeUndefined();
});
it("A08: direct numeric results cannot be overwritten and do not falsely return success", async () => {
  const before = game().aiCompatibility;
  expect((await record("RAM", "fail")).error).toContain("sayısal");
  expect(game().aiCompatibility).toEqual(before);
  expect(row("RAM").status).toBe("pass");
});
it("A09: summary tool accepts missing description, uses LM and supports undo", async () => {
  const lm = vi.spyOn(s.lm, "shortSummary").mockResolvedValue("Fixture summary.");
  const result = await execute("generate_short_description", { gameId: id });
  expect(result.summary).toBe("Fixture summary.");
  expect(lm).toHaveBeenCalledWith("Fixture", "", expect.any(AbortSignal));
  expect(game().aiSummary).toBe("Fixture summary.");
  s.store.undo();
  expect(game().aiSummary).toBeUndefined();
});
it.each(["", "   ", "Algılanamadı", "Bilinmiyor", "unknown"])(
  "A10: absent CPU %j cannot receive AI pass",
  async (cpu) => {
    s.store.hardware({ cpu });
    expect((await record("CPU")).error).toContain("donanım");
    expect(row("CPU").ai).toBeUndefined();
    expect(game().aiCompatibility).toBeUndefined();
  },
);
it("A10: even old saved positive CPU result cannot turn missing actual hardware into pass", () => {
  s.store.hardware({ cpu: "" });
  s.store.metadata(id, {
    aiCompatibility: [
      {
        level: "minimum",
        component: "CPU",
        status: "pass",
        reason: "Legacy bug",
        contextKey: compatibilityKey(game(), s.store.state.hardware),
        checkedAt: at,
      },
    ],
  });
  expect(row("CPU")).toMatchObject({
    status: "unknown",
    actual: "Algılanamadı",
    aiEditable: false,
  });
  expect(row("CPU").ai).toBeUndefined();
});
it("A10: missing requirement cannot receive AI pass either", async () => {
  await patch({ minimum: { gpu: null } });
  const key = componentCompatibilityKey(game(), s.store.state.hardware, "minimum", "GPU");
  expect((await record("GPU", "pass", key)).error).toContain("bulunamadı");
  expect(rowOrNone("GPU")).toBeUndefined();
  expect(game().aiCompatibility?.some((r) => r.component === "GPU")).not.toBe(true);
});
it("A11: found without any hours is rejected atomically, real zero remains a numeric value", async () => {
  expect(
    (await patch({ year: 2001, hltb: { status: "found", checkedAt: at } })).error,
  ).toContain("süre");
  expect(game().year).toBeUndefined();
  expect(game().hltb).toBeUndefined();
  expect((await patch({ hltb: { status: "found", main: 0 } })).ok).toBe(true);
  expect(hasCompletionHours(game().hltb)).toBe(true);
});
it("A11: saved hardware results complete research; HLTB/Turkish data is not a research stage", async () => {
  s.store.metadata(id, {
    minimum: {
      raw: "Fixture",
      unpublished: ["os"],
      cpu: h.cpu,
      gpu: h.gpu,
      ramGB: 1,
      storageGB: 7,
    },
    recommended: { raw: "", availability: "not_published" },
  });
  vi.spyOn(s.lm, "models").mockResolvedValue([
    {
      id: "fixture",
      name: "fixture",
      loaded: true,
      context: null,
      tools: true,
      reasoning: [],
    },
  ]);
  const stream = vi.spyOn(s.lm, "stream").mockResolvedValue({
    text: "Fixture done",
    thinking: "",
    calls: [],
  });
  await s.call("researchGame", { id });
  await vi.waitFor(() => expect(game().research?.status).toBe("done"));
  expect(game().research?.message).not.toMatch(/HLTB|Türkçe/);
  expect(game().hltb).toBeUndefined();
  // Messages (policy + stage prompts) never ask for durations or language.
  const messages = JSON.stringify(stream.mock.calls.map((c) => c[0]));
  expect(messages).not.toMatch(/DİL VE SÜRE|TÜRKÇE YAMA|HLTB/);
  // Durations stay a normal, optional field the agent may still save on request.
  expect((await patch({ hltb: { status: "found", main: 5 } })).ok).toBe(true);
  expect(game().research?.status).toBe("done");
});

it("A04: provider refresh can update other shops without undoing the AI Steam correction", async () => {
  s.store.metadata(id, {
    storeChecks: [
      { store: "GOG", status: "not_found", checkedAt: at, source: "Old provider" },
    ],
  });
  await patch({ stores: [product] });
  const incoming = {
    stores: [{ name: "GOG", url: "https://www.gog.com/en/game/fixture", verified: true }],
    storeChecks: [
      {
        store: "GOG" as const,
        status: "found" as const,
        checkedAt: at,
        source: "New provider",
        url: "https://www.gog.com/en/game/fixture",
      },
    ],
  };
  const preserved = preserveResearchFields(game(), incoming);
  expect(
    card({ ...game(), ...preserved }, "GOG")
      .find(".badge")
      .text(),
  ).toBe("Var");
  expect(
    card({ ...game(), ...preserved }, "Steam")
      .find(".badge")
      .text(),
  ).toBe("Var");
  expect(preserved.storeChecks!.find((c) => c.store === "GOG")?.source).toBe(
    "New provider",
  );
});
