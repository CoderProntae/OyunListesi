import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
import { Service } from "../electron/service";
import { Providers } from "../electron/providers";
import { webRequest } from "../electron/network";
import { fitHistory, isRealUser, type HistoryMessage } from "../electron/context";
import { compatibility } from "../shared/compatibility";
import { assessGame } from "../shared/analysis";
import { initialState } from "../shared/domain";
vi.mock("../electron/network", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../electron/network")>()),
  webRequest: vi.fn(async () => {
    throw new Error("offline in tests");
  }),
}));
const fx = JSON.parse(
  fs.readFileSync(path.resolve("tests/fixtures/stores-1.0.16.json"), "utf8"),
);
const values = (r: any) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => k !== "raw"));
const reply = (value: any) => ({
  text: JSON.stringify(value),
  url: "https://example.com/",
  body: Buffer.from(JSON.stringify(value)),
  type: "application/json",
});
const hardware = {
  ...initialState().hardware,
  os: "Microsoft Windows 10 Pro",
  osVersion: "10.0.19045",
  cpu: "Core™ i5-4460",
  gpu: "NVIDIA GeForce GTX 1660 SUPER",
  ramGB: 8,
  vramGB: 6,
  vramCertain: true,
  diskFreeGB: 15.97,
  directX: 12.1,
};
let root: string, store: Store;
beforeEach(() => {
  fs.mkdirSync(".cache", { recursive: true });
  root = fs.mkdtempSync(path.resolve(".cache/117-"));
  store = new Store(root);
  vi.mocked(webRequest).mockReset();
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
const game = (minimum: any, recommended: any = {}) => {
  const id = store.add([{ name: "Oyun " + Math.random() }]).added[0];
  store.metadata(id, {
    minimum: { raw: "", ...minimum },
    recommended: { raw: "", ...recommended },
  });
  return store.requireGames([id])[0];
};

describe("1.0.17 system compatibility wording", () => {
  it("a game without a recommended level that meets the minimum meets its requirements", () => {
    const c = compatibility(game({ ramGB: 4, storageGB: 7 }), hardware);
    expect(c.status).toBe("recommended");
    expect(c.label).toBe("Gereksinimleri karşılıyor");
    expect(c.summary).not.toContain("önerilen");
    expect(c.recommended).toEqual([]);
  });
  it("meeting the minimum below a published recommended level stays 'Minimumu karşılıyor'", () => {
    const c = compatibility(game({ ramGB: 4 }, { ramGB: 16 }), hardware);
    expect(c.status).toBe("minimum");
    expect(c.label).toBe("Minimumu karşılıyor");
  });
  it("a recommended level without a CPU adds no CPU row and does not hide an unverified minimum row", () => {
    const g = game({ ramGB: 4, cpu: "Bilinmeyen İşlemci 9000" }, { storageGB: 0.81 });
    const c = compatibility(g, hardware);
    expect(c.recommended.map((r) => r.name)).toEqual(["Disk"]);
    expect(c.status).toBe("unknown");
  });
  it("placeholder words are not requirements", () => {
    const c = compatibility(
      game({ ramGB: 4 }, { cpu: "Yayımlanmamış", gpu: "Yok" }),
      hardware,
    );
    expect(c.recommended).toEqual([]);
    expect(c.label).toBe("Gereksinimleri karşılıyor");
    expect(assessGame(game({ ramGB: 4 }), hardware).summary).toContain(
      "Mağazanın yayımladığı",
    );
  });
});

describe("1.0.17 requirements come only from the store", () => {
  it("a store refresh replaces values a chat wrote earlier", async () => {
    vi.mocked(webRequest).mockImplementation(async (url: string) => {
      if (url.includes("appdetails"))
        return reply({
          12140: {
            success: true,
            data: {
              name: "Max Payne",
              platforms: { windows: true, mac: false, linux: false },
              pc_requirements: { minimum: fx.steam["12140"].minimum },
            },
          },
        });
      throw new Error("offline");
    });
    const id = store.add([{ name: "Max Payne", appId: 12140 }]).added[0];
    store.metadata(id, {
      recommended: { raw: "", storageGB: 0.81, cpu: "Pentium III 1 GHz" },
      aiEditedFields: ["recommended.storageGB", "recommended.cpu", "aiSummary"],
    });
    await new Providers(store, () => "").enrich(id, true);
    const g = store.requireGames([id])[0];
    expect(values(g.recommended)).toEqual({});
    expect(g.minimum.storageGB).toBe(830 / 1024);
    expect(g.aiEditedFields).toEqual(["aiSummary"]);
    expect(compatibility(g, hardware).recommended).toEqual([]);
  });
  it("the one-time repair releases every requirement mark and clears games without a store", () => {
    const [steam, none] = store.add([
      { name: "Steam oyunu", appId: 8080 },
      { name: "Platformsuz", origin: { store: "none" } as any },
    ]).added;
    store.metadata(steam, {
      aiEditedFields: ["recommended.cpu", "aiSummary"],
      recommended: { raw: "", cpu: "Core 2 Duo" },
    });
    store.metadata(none, { minimum: { raw: "RAM: 4 GB", ramGB: 4 } });
    store.storeOnlyRequirements(store.state);
    const [a, b] = store.requireGames([steam, none]);
    expect(a.aiEditedFields).toEqual(["aiSummary"]);
    expect(a.storeSync).toBe(true);
    expect(values(b.minimum)).toEqual({});
  });
});

describe("1.0.17 fitting a request into half of the context", () => {
  const call = (id: string, name: string) => ({
    role: "assistant" as const,
    content: null,
    tool_calls: [
      { id, type: "function", function: { name, arguments: JSON.stringify({ q: "x" }) } },
    ],
  });
  const history: HistoryMessage[] = [
    { role: "user", content: "Önceki soru" },
    call("t1", "fetch_page"),
    {
      role: "tool",
      tool_call_id: "t1",
      content: JSON.stringify({ url: "https://a", text: "uzun metin ".repeat(3000) }),
    },
    { role: "assistant", content: "Sayfa okundu. ".repeat(200) },
    { role: "user", content: "Yeni soru: bu oyun bende çalışır mı?" },
    call("t2", "get_game_info"),
    {
      role: "tool",
      tool_call_id: "t2",
      content: JSON.stringify({
        name: "Oyun",
        description: "açıklama ".repeat(2000),
        screenshots: Array.from({ length: 30 }, (_, i) => "https://img/" + i),
      }),
    },
  ];
  it("fits, keeps the newest request and keeps tool calls paired", () => {
    const before = JSON.stringify(history);
    const r = fitHistory(history, 6000);
    expect(r.fits).toBe(true);
    expect(r.changed).toBe(true);
    expect(JSON.stringify(r.messages).length).toBeLessThanOrEqual(6000);
    expect(r.messages.filter(isRealUser).at(-1)!.content).toContain(
      "Yeni soru: bu oyun bende çalışır mı?",
    );
    r.messages.forEach((m, i) => {
      for (const c of m.tool_calls || [])
        expect(
          r.messages
            .slice(i + 1)
            .some((x) => x.role === "tool" && x.tool_call_id === c.id),
        ).toBe(true);
    });
    expect(r.messages.find((m) => m.tool_call_id === "t2")!.content).toContain(
      '"name":"Oyun"',
    );
    expect(JSON.stringify(history)).toBe(before);
  });
  it("leaves a history that already fits untouched and reports when nothing fits", () => {
    expect(fitHistory(history, 1e9).changed).toBe(false);
    expect(fitHistory(history, 50).fits).toBe(false);
  });
});

describe("1.0.17 two requests at once", () => {
  let service: Service, dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.resolve(".cache/117s-"));
    service = new Service(dir);
    service.store.settings({
      lmModel: "test",
      requireApproval: false,
      contextTokens: 40000,
    });
    vi.spyOn(service.queue, "add").mockImplementation(() => {});
  });
  afterEach(async () => {
    service.close();
    await new Promise((r) => setTimeout(r, 5));
    service.store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("a second chat runs while the first one works, shortened to half of the context", async () => {
    const a = service.store.createChat(),
      b = service.store.createChat();
    b.apiHistory.push(
      { role: "user", content: "Sayfayı oku" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "t1",
            type: "function",
            function: { name: "fetch_page", arguments: '{"url":"https://example.com"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "t1",
        content: JSON.stringify({ text: "Uzun sayfa metni ".repeat(6000) }),
      },
      { role: "assistant", content: "Sayfa okundu." },
    );
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const seen: string[] = [];
    vi.spyOn(service.lm, "stream").mockImplementation(async (messages, tools, _s, on) => {
      const text = JSON.stringify(messages);
      if (text.includes("A isteği")) {
        seen.push("A");
        await gate;
      } else seen.push("B:" + (text.length + JSON.stringify(tools || []).length));
      on("text", "Tamam.");
      return { text: "Tamam.", thinking: "", calls: [] };
    });
    await service.call("send", { chatId: a.id, text: "A isteği" });
    await vi.waitFor(() => expect(seen).toContain("A"));
    await service.call("send", { chatId: b.id, text: "B isteği" });
    await vi.waitFor(() => expect(seen.some((s) => s.startsWith("B:"))).toBe(true));
    expect(service.agent.busy.has(a.id)).toBe(true);
    const size = Number(seen.find((s) => s.startsWith("B:"))!.slice(2));
    expect(size).toBeLessThan(20000 * 3);
    expect(
      b.messages
        .at(-1)!
        .blocks.some((x) => x.type === "notice" && x.text.includes("bağlamın yarısına")),
    ).toBe(true);
    expect(b.apiHistory[2].content!.length).toBeGreaterThan(90000);
    open();
    await vi.waitFor(() => expect(service.agent.busy.size).toBe(0));
  });
  it("with the setting off a second chat must wait", async () => {
    service.store.settings({ parallelRequests: false });
    const a = service.store.createChat(),
      b = service.store.createChat();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    vi.spyOn(service.lm, "stream").mockImplementation(async () => {
      await gate;
      return { text: "Tamam.", thinking: "", calls: [] };
    });
    await service.call("send", { chatId: a.id, text: "A" });
    await expect(service.call("send", { chatId: b.id, text: "B" })).rejects.toThrow(
      "Önce çalışan ajan turunun bitmesini bekle",
    );
    open();
    await vi.waitFor(() => expect(service.agent.busy.size).toBe(0));
  });
  it("no chat can write system requirements", async () => {
    const id = service.store.add([{ name: "Portal" }]).added[0];
    const chat = service.store.createChat();
    let n = 0;
    vi.spyOn(service.lm, "stream").mockImplementation(async () =>
      n++ === 0
        ? {
            text: "",
            thinking: "",
            calls: [
              {
                id: "c1",
                name: "update_game_info",
                arguments: JSON.stringify({
                  gameId: id,
                  patch: { recommended: { cpu: "Intel Core i7" } },
                }),
              },
            ],
          }
        : { text: "Yapamadım.", thinking: "", calls: [] },
    );
    await service.agent.send(chat.id, "Önerilen işlemciyi i7 yap");
    await vi.waitFor(() => expect(service.agent.busy.size).toBe(0));
    const block = chat.messages
      .flatMap((m) => m.blocks)
      .find((b) => b.type === "tool") as any;
    expect(block.status).toBe("error");
    expect(block.error).toContain("mağaza sayfasından");
    expect(service.store.requireGames([id])[0].recommended.cpu).toBeUndefined();
  });
});
