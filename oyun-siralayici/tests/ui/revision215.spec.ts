import { test, expect, type APIRequestContext } from "@playwright/test";
import { initialState, newGame } from "../../shared/domain";
// 2.1.5 · whole-app sweep (stages 1–7): every screen, tab and window is
// opened once; nothing may throw, and no internal value or English control
// text may reach the screen.
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
// Values that must never be readable on screen.
const BAD =
  /\bundefined\b|\bNaN\b|\[object |too_small|Invalid input|Expected \w+, received|\{\s*"/g;
// English control words: the whole interface is Turkish.
const EN =
  /\b(Save|Cancel|Submit|Loading|Search|Delete|Close|None|Settings|Warning|Retry|Apply|Choose|Browse|Remove|Add)\b/g;

const genres = [
  "Aksiyon",
  "Çocuk",
  "İsim",
  "Ödül",
  "Rol Yapma",
  "Strateji",
  "Şehir",
  "Ürkütücü",
  "Yarış",
];
function seed() {
  const s = initialState();
  Object.assign(s.settings, {
    animations: false,
    autoResearch: false,
    autoSummary: false,
    firstRun: false,
    lmModel: "",
    theme: "dark",
  });
  Object.assign(s.hardware, {
    cpu: "Intel(R) Core(TM) i5-4460 CPU @ 3.20GHz",
    cores: 4,
    threads: 4,
    clockGHz: 3.2,
    gpu: "NVIDIA GeForce GTX 1660 SUPER",
    vramGB: 6,
    ramGB: 8,
    manual: true,
  });
  const rows: [string, number, string[], any][] = [
    [
      "Çiçek Çocuk",
      2011,
      ["Çocuk", "Aksiyon"],
      {
        minimum: {
          os: "Windows 7 64-bit",
          cpu: "Athlon II X4 760K",
          gpu: "GeForce 600 series",
          ramGB: 4,
          vramGB: 1,
          storageGB: 20,
          directX: 11,
          raw: "OS: Windows 7 64-bit\nProcessor: Athlon II X4 760K\nGraphics: GeForce 600 series",
        },
        recommended: {
          cpu: "Intel Core i7 4700",
          gpu: "Radeon HD 7000 series",
          ramGB: 8,
          raw: "Processor: Intel Core i7 4700\nGraphics: Radeon HD 7000 series",
        },
        requirementSource: {
          store: "Steam",
          url: "https://store.steampowered.com/app/1",
          checkedAt: new Date().toISOString(),
        },
        metacritic: 82,
        steamScore: 94,
        aiSummary: "Kısa bir özet.",
        rating: 8,
        status: "playing",
        playHours: 12.5,
      },
    ],
    [
      "Şeker Fabrikası",
      2005,
      ["Strateji", "Şehir"],
      {
        minimum: { raw: "" },
        recommended: { raw: "" },
        pcgw: {
          status: "not_found",
          message: "PCGamingWiki'de de bulunamadı.",
          checkedAt: new Date().toISOString(),
        },
        research: { status: "done", message: "Araştırma sonuçları kaydedildi." },
        tags: ["uzun", "klasik"],
        status: "finished",
      },
    ],
    [
      "İzmir 1922",
      1998,
      ["İsim", "Rol Yapma"],
      {
        minimum: { raw: "64" },
        recommended: { raw: "" },
        notes: "Kendi notum.",
        status: "planned",
        inPlayList: false,
      },
    ],
    ["Ödül Avcısı", 2020, ["Ödül"], { tags: ["kısa"], status: "watch" }],
    ["Ürkütücü Gece", 2015, ["Ürkütücü"], { status: "dropped" }],
    ["Yarış 3", 2018, ["Yarış"], { platforms: ["Windows"], status: "planned" }],
  ];
  s.games = rows.map(([name, year, g, extra], i) => ({
    ...newGame(name, i),
    id: "g" + i,
    year,
    genres: g,
    platforms: (extra as any).platforms || ["Windows"],
    hltb:
      i % 2
        ? {
            status: "found",
            title: name,
            mainStory: 8,
            mainExtra: 12,
            completionist: 20,
            checkedAt: new Date().toISOString(),
            sourceUrl: "https://howlongtobeat.com/game/1",
          }
        : { status: "not_found", checkedAt: new Date().toISOString() },
    groupIds: i < 2 ? ["grup1"] : [],
    ...extra,
  })) as any;
  s.groups = [{ id: "grup1", name: "İlk grup", color: "#7c5cff", icon: "star" }] as any;
  return s;
}

test.afterAll(async ({ request }) => {
  await call(request, "import", { text: JSON.stringify(initialState()) });
});

test("every screen: no thrown error, no internal value, no English control", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  // A step that cannot find its control must fail in seconds, not minutes.
  page.setDefaultTimeout(8_000);
  const thrown: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") thrown.push("console: " + m.text());
  });
  page.on("pageerror", (e) => thrown.push("pageerror: " + e.message));
  await call(request, "import", { text: JSON.stringify(seed()) });
  await page.goto("/");
  // The app remembers the last screen; the sweep starts from the library.
  const back = page.getByRole("button", { name: "Kütüphane", exact: true });
  if (await back.count()) await back.click();
  await expect(page.locator(".game-row").first()).toBeVisible();

  const problems: string[] = [];
  const scan = async (where: string) => {
    // The version notes quote broken values on purpose ("undefined", "NaN",
    // "Choose File"); what the release notes say is not what the app shows.
    const text = await page.evaluate(() => {
      const all = document.body.innerText.split("\n");
      const notes = [...document.querySelectorAll(".release-notes")]
        .map((n) => (n as HTMLElement).innerText)
        .join("\n");
      return (notes ? all.filter((l) => !notes.includes(l)) : all).join("\n");
    });
    const hits = [...new Set(text.match(BAD) || [])];
    if (hits.length) problems.push(`${where}: ${hits.join(" / ")}`);
    // Chromium's own file box is English ("Choose File"); every file input the
    // app shows must be a hidden one behind a Turkish button.
    const rawFile = await page.evaluate(
      () =>
        [...document.querySelectorAll('input[type="file"]')].filter(
          (i) => (i as HTMLElement).offsetParent !== null,
        ).length,
    );
    if (rawFile) problems.push(`${where}: İngilizce dosya seçme kutusu görünür`);
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll("button, label, th, .file-button, option, summary")]
        .map((e) => `${e.textContent || ""} ${(e as HTMLInputElement).value || ""}`)
        .join("\n"),
    );
    // Product names are English on purpose ("Brave Search API", "LM Studio").
    const en = [
      ...new Set(
        controls
          .replace(
            /Brave Search API|LM Studio|SteamDB|PCGamingWiki|HowLongToBeat|TechPowerUp|PassMark|My Abandonware|EGData|SearXNG/g,
            " ",
          )
          .match(EN) || [],
      ),
    ];
    if (en.length) problems.push(`${where}: İngilizce "${en.join(", ")}"`);
  };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e: any) {
      problems.push(`${name}: adım çalışmadı (${String(e.message).split("\n")[0]})`);
      return;
    }
    await page.waitForTimeout(140);
    await scan(name);
  };

  // --- library: every sort and every filter ---
  const sorts = await page.locator('[aria-label="Sıralama"] option').count();
  for (let i = 0; i < sorts; i++)
    await step(`sıralama ${i}`, () =>
      page.selectOption('[aria-label="Sıralama"]', { index: i }),
    );
  // The filters sit behind the "Filtreler" button.
  await step("filtreleri aç", () => page.getByTitle("Filtreler").click());
  for (const what of ["Durum", "Tür", "Yıl", "Platform"]) {
    const n = await page.locator(`[aria-label="${what} filtresi"] option`).count();
    for (let i = 0; i < n; i++)
      await step(`${what} filtresi ${i}`, async () => {
        await page.selectOption(`[aria-label="${what} filtresi"]`, { index: i });
        await page.selectOption(`[aria-label="${what} filtresi"]`, { index: 0 });
      });
  }
  await step("arama", async () => {
    await page.locator('[aria-label="Oyun ara"]').fill("şek");
    await expect(page.locator(".game-row")).toHaveCount(1);
    await page.locator('[aria-label="Oyun ara"]').fill("");
  });
  await step("grup", async () => {
    // Own groups sit behind the "Koleksiyonlar" heading.
    await page.getByRole("button", { name: /Koleksiyonlar/ }).click();
    await page.locator(".group-chip", { hasText: "İlk grup" }).click();
    await expect(page.locator(".game-row")).toHaveCount(2);
    await page.locator(".group-chip", { hasText: "Oynama Listesi" }).click();
    await expect(page.locator(".game-row")).toHaveCount(6);
  });
  await step("satır önizleme", async () => {
    await page.locator(".game-row").first().hover();
  });

  // --- game page: every tab, the note, the user's own verdict ---
  await step("oyun sayfası", () => page.locator(".game-row").first().click());
  for (const tab of ["Genel bakış", "Mağazalar", "Sistem", "Not"])
    await step(`sekme ${tab}`, () => page.getByRole("tab", { name: tab }).click());
  await step("not yaz", async () => {
    await page.getByRole("tab", { name: "Not" }).click();
    const box = page.locator("textarea").first();
    if (await box.count()) await box.fill("Deneme notu.");
  });
  await step("sistem tablosu", () => page.getByRole("tab", { name: "Sistem" }).click());

  // --- statistics, chat, settings ---
  await step("istatistikler", () =>
    page.getByRole("button", { name: "İstatistikler" }).click(),
  );
  await step("kütüphaneye dönüş", () =>
    page.getByRole("button", { name: "Kütüphane", exact: true }).click(),
  );
  await step("sohbet", async () => {
    await page.getByRole("button", { name: "AI sohbeti" }).click();
    await page.waitForTimeout(200);
  });
  await step("ayarlar", async () => {
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await expect(page.locator(".modal")).toBeVisible();
  });
  for (const tab of [
    "Görünüm",
    "LM Studio",
    "Ajan & güvenlik",
    "Donanım",
    "Web araştırması",
    "Veriler & yedekler",
    "Oyun katmanı",
    "Güncellemeler",
    "Kısayollar",
  ])
    await step(`ayar sekmesi ${tab}`, () =>
      page.locator(".settings-nav").getByRole("button", { name: tab }).click(),
    );
  await step("ayarları kapat", async () => {
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);
  });

  // --- the other windows ---
  const nav = page.locator(".nav-rail");
  await step("komut penceresi", async () => {
    await page.keyboard.press("Control+k");
    await expect(page.locator(".modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);
  });
  await step("oyun ekle", async () => {
    await nav.getByRole("button", { name: "Oyun ekle" }).click();
    await expect(page.locator(".modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);
  });
  await step("yeni grup", async () => {
    await nav.getByRole("button", { name: "Yeni özel grup" }).click();
    await expect(page.locator(".modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".modal")).toHaveCount(0);
  });

  expect(problems, problems.join("\n")).toEqual([]);
  expect(thrown, thrown.join("\n")).toEqual([]);
});

test("Turkish letters keep their place in the genre filter and the list", async ({
  page,
  request,
}) => {
  await call(request, "import", { text: JSON.stringify(seed()) });
  await page.goto("/");
  await page.getByRole("button", { name: "Kütüphane", exact: true }).click();
  await expect(page.locator(".game-row").first()).toBeVisible();
  await page.getByTitle("Filtreler").click();
  const options = await page
    .locator('[aria-label="Tür filtresi"] option')
    .evaluateAll((list) => list.map((o) => (o as HTMLOptionElement).text).slice(1));
  expect(options).toEqual(genres);
  // The list sorted by name: ç, ğ, ı, i, ö, ş, ü are letters of their own.
  const sortValue = await page
    .locator('[aria-label="Sıralama"] option')
    .evaluateAll((list) => {
      const hit = list.find((o) => /name/i.test((o as HTMLOptionElement).value));
      return hit ? (hit as HTMLOptionElement).value : "";
    });
  if (sortValue) {
    await page.selectOption('[aria-label="Sıralama"]', sortValue);
    const names = await page
      .locator(".game-row-text strong")
      .evaluateAll((list) => list.map((e) => e.textContent || ""));
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "tr")));
    expect(names[0]).toBe("Çiçek Çocuk");
  }
});

test("edge states: no games, a 300-character name, delete + undo, round-trip", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(8_000);
  const thrown: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") thrown.push("console: " + m.text());
  });
  page.on("pageerror", (e) => thrown.push("pageerror: " + e.message));
  const problems: string[] = [];
  const scan = async (where: string) => {
    // The version notes quote broken values on purpose ("undefined", "NaN",
    // "Choose File"); what the release notes say is not what the app shows.
    const text = await page.evaluate(() => {
      const all = document.body.innerText.split("\n");
      const notes = [...document.querySelectorAll(".release-notes")]
        .map((n) => (n as HTMLElement).innerText)
        .join("\n");
      return (notes ? all.filter((l) => !notes.includes(l)) : all).join("\n");
    });
    const hits = [...new Set(text.match(BAD) || [])];
    if (hits.length) problems.push(`${where}: ${hits.join(" / ")}`);
  };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e: any) {
      problems.push(`${name}: adım çalışmadı (${String(e.message).split("\n")[0]})`);
      return;
    }
    await page.waitForTimeout(150);
    await scan(name);
  };
  const library = async () => {
    await page.getByRole("button", { name: "Kütüphane", exact: true }).click();
  };

  // --- an empty library: nothing may break or invent a game ---
  const empty = initialState();
  Object.assign(empty.settings, { animations: false, firstRun: false, lmModel: "" });
  empty.games = [];
  await call(request, "import", { text: JSON.stringify(empty) });
  await page.goto("/");
  await step("boş kütüphane", library);
  await step("boş · istatistikler", () =>
    page.getByRole("button", { name: "İstatistikler", exact: true }).click(),
  );
  await step("boş · sohbet", () =>
    page.getByRole("button", { name: "AI sohbeti" }).click(),
  );
  await step("boş · ayarlar", async () => {
    await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
    await page.locator(".settings-nav").getByRole("button", { name: "Donanım" }).click();
    await page.keyboard.press("Escape");
  });

  // --- one game, the longest name the app allows, no data at all ---
  const long = initialState();
  Object.assign(long.settings, { animations: false, firstRun: false, lmModel: "" });
  const longName = "Ç".repeat(150) + " " + "ğ".repeat(149);
  long.games = [
    { ...newGame(longName, 0), id: "uzun", platforms: [], genres: [] },
  ] as any;
  await call(request, "import", { text: JSON.stringify(long) });
  await page.reload();
  await step("uzun ad · liste", library);
  await step("uzun ad · sayfa", () => page.locator(".game-row").first().click());
  for (const tab of ["Genel bakış", "Mağazalar", "Sistem", "Not"])
    await step(`uzun ad · ${tab}`, () => page.getByRole("tab", { name: tab }).click());
  await step("uzun ad · istatistikler", () =>
    page.getByRole("button", { name: "İstatistikler", exact: true }).click(),
  );
  await library();

  // --- delete, then undo: the game comes back with its name ---
  await step("sil", async () => {
    await page.locator(".game-row").first().click();
    await page.keyboard.press("Delete");
    await expect(page.locator(".modal")).toBeVisible();
    await page.locator(".modal").getByRole("button", { name: "Onayla" }).click();
    await expect(page.locator(".game-row")).toHaveCount(0);
  });
  await step("geri al", async () => {
    await page.getByRole("button", { name: "Geri al" }).click();
    await expect(page.locator(".game-row")).toHaveCount(1);
  });

  // --- export → import: the same library comes back ---
  const before = await call(request, "bootstrap");
  const exported = await call(request, "export", { format: "json" });
  const text =
    typeof exported === "string" ? exported : exported?.text || exported?.json || "";
  await step("dışa aktar", async () => {
    expect(text.length).toBeGreaterThan(50);
    await call(request, "import", { text });
    const after = await call(request, "bootstrap");
    expect(after.state.games.length).toBe(before.state.games.length);
    expect(after.state.games[0]?.name).toBe(before.state.games[0]?.name);
  });

  expect(problems, problems.join("\n")).toEqual([]);
  expect(thrown, thrown.join("\n")).toEqual([]);
});
