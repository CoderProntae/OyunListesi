import { test, type APIRequestContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { inspect, type Issue } from "./audit-inspect";
import { initialState, newGame } from "../shared/domain";
import { BUILTIN_PRESETS, defaultOverlay, emptyOverlayData, type OverlayData, type OverlaySettings } from "../shared/overlay";

// Dev-only audit of everything around the in-game indicator (not part of the
// test suite): Ayarlar → Oyun katmanı (every sub-tab), the Ctrl+Tab panel and
// the corner HUD in its states, with a fake overlay bridge.
//   npx playwright test -c scripts/overlay-audit.config.ts
const out = path.resolve(__dirname, "../.cache/overlay-audit");
const call = async (request: APIRequestContext, method: string, args: any = {}) => {
  const response = await request.post("/api/call", {
    headers: { "X-Oyun-Client": "desktop-preview" },
    data: { method, args },
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.error);
  return data.result;
};
const LONG = "The Elder Scrolls V: Skyrim Special Edition – Anniversary Upgrade Pack";
const subTabs = ["Göstergeler", "Görünüm", "Süre ve alarm", "Ses", "FPS sınırı", "Oyun ve izinler"];
function liveData(over: Partial<OverlayData> = {}): OverlayData {
  return {
    ...emptyOverlayData(),
    game: {
      name: LONG,
      exe: "skyrimse.exe",
      pid: 7,
      known: true,
      startedAt: new Date(Date.now() - 20 * 60000).toISOString(),
      foreground: true,
      visible: true,
    },
    metrics: { fps: null, low1: null, frametime: null, cpu: 37, gpu: 97, gpuTemp: 71, vram: 4.2, ram: 6.1, gpuPower: 118, gpuClock: 1905, fan: 44 },
    totals: { ramGB: 8, vramGB: 6 },
    fps: "permission",
    fpsMessage: "FPS ölçümü için Windows izni gerekiyor (bir kerelik, Ctrl+Tab panelinden verilebilir).",
    sensors: { gpu: "nvidia", cpuTemp: "none" },
    limits: { method: "nvidia", applied: 60, message: "NVIDIA sınırı oyun yeniden açılınca geçerli olur." },
    ...over,
  };
}
// window.overlay replacement: answers like the overlay manager does.
async function fakeBridge(page: Page, settings: OverlaySettings, data: OverlayData) {
  const sizes: { width: number; height: number; at: number }[] = [];
  await page.exposeFunction("__auditResize", async (width: number, height: number) => {
    sizes.push({ width, height, at: Date.now() });
    await page.setViewportSize({ width: Math.max(80, Math.min(1800, width)), height: Math.max(30, Math.min(1000, height)) });
  });
  await page.addInitScript(
    ({ settings, data }) => {
      let s = settings;
      const listeners: ((d: any) => void)[] = [];
      (window as any).overlay = {
        call: async (method: string, args: any) => {
          if (method === "state") return { settings: s, data, games: [{ id: "g1", name: "Hades" }], platform: "win32" };
          if (method === "settings") return (s = { ...s, ...args.patch });
          if (method === "resize") return (window as any).__auditResize(args.width, args.height);
          if (method === "action") return { ok: true, message: "Tamam." };
          return true;
        },
        onData: (cb: (d: any) => void) => {
          listeners.push(cb);
          return () => listeners.splice(listeners.indexOf(cb), 1);
        },
      };
    },
    { settings, data },
  );
  return sizes;
}
test("overlay audit", async ({ browser, request }) => {
  test.setTimeout(600000);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const issues: Issue[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  const watch = (page: Page) => {
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  };
  // 1. Ayarlar → Oyun katmanı, every sub-tab.
  for (const theme of ["dark", "light"])
    for (const [w, h] of [
      [1920, 1080],
      [1366, 768],
      [960, 650],
    ]) {
      const state = initialState();
      Object.assign(state.settings, { animations: false, autoResearch: false, autoSummary: false, firstRun: false, theme });
      state.games = ["Hades", "Celeste", LONG].map((n, i) => newGame(n, i)) as any;
      await call(request, "import", { text: JSON.stringify(state) });
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      watch(page);
      await page.goto("/");
      await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
      await page.locator(".settings-nav").getByRole("button", { name: "Oyun katmanı", exact: true }).click();
      for (const tab of subTabs) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await page.waitForTimeout(150);
        const tag = `${w}x${h}-${theme}-settings-${tab.replace(/\W+/g, "")}`;
        await inspect(page, tag, issues);
        if (w !== 1366) await page.screenshot({ path: path.join(out, tag + ".png") });
      }
      await page.close();
    }
  // 2. The Ctrl+Tab panel (real window size 860×620), every tab.
  {
    const page = await browser.newPage({ viewport: { width: 860, height: 620 } });
    watch(page);
    await fakeBridge(page, { ...defaultOverlay, fpsMethod: "nvidia", fpsLimit: 60, alarms: [{ id: "a", time: "21:30", label: "Yemek", enabled: true }] }, liveData());
    await page.goto("/overlay.html#panel");
    await page.getByTestId("overlay-panel").waitFor();
    for (const tab of subTabs) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.waitForTimeout(150);
      const tag = `panel-${tab.replace(/\W+/g, "")}`;
      await inspect(page, tag, issues);
      await page.screenshot({ path: path.join(out, tag + ".png") });
    }
    await page.close();
  }
  // 3. The corner HUD: the sliding notice (window grows to fit), the values,
  //    the permission state, a wide horizontal look.
  const hudCases: [string, Partial<OverlaySettings>, Partial<OverlayData>, number][] = [
    ["toast-long-name", {}, { game: { ...liveData().game!, startedAt: new Date().toISOString() } }, 1500],
    ["standard-permission", {}, {}, 600],
    ["standard-ok", {}, { fps: "ok", fpsMessage: undefined, metrics: { ...liveData().metrics, fps: 143.2, low1: 98, frametime: 7 } }, 600],
    ["detailed-title", { presetId: "detailed", presets: BUILTIN_PRESETS.map((p) => (p.id === "detailed" ? { ...p, showTitle: true } : p)) }, { fps: "starting" }, 600],
    [
      "horizontal-wide",
      { presetId: "detailed", presets: BUILTIN_PRESETS.map((p) => (p.id === "detailed" ? { ...p, layout: "horizontal", scale: 1.4 } : p)) },
      { fps: "ok", metrics: { ...liveData().metrics, fps: 61, low1: 40, frametime: 16.4 } },
      600,
    ],
    ["alert", {}, { alerts: [{ id: "x", kind: "limit", text: "1:30 oynadın — belirlediğin süre doldu.", until: Date.now() + 60000 }] }, 600],
  ];
  for (const [name, s, d, wait] of hudCases) {
    const page = await browser.newPage({ viewport: { width: 240, height: 120 } });
    watch(page);
    const sizes = await fakeBridge(page, { ...defaultOverlay, ...s }, liveData(d));
    await page.goto("/overlay.html#hud");
    await page.waitForTimeout(wait);
    const box = await page.evaluate(() => {
      const el = document.querySelector(".hud-root")?.firstElementChild as HTMLElement | null;
      return el ? { w: el.offsetWidth, h: el.offsetHeight, sw: el.scrollWidth, text: el.innerText.replace(/\s+/g, " ").slice(0, 160) } : null;
    });
    const vp = page.viewportSize();
    notes.push(`${name}: resize calls=${sizes.length} last=${JSON.stringify(sizes.at(-1) || null)} viewport=${vp?.width}x${vp?.height} box=${JSON.stringify(box)}`);
    await inspect(page, `hud-${name}`, issues);
    await page.screenshot({ path: path.join(out, `hud-${name}.png`) });
    await page.close();
  }
  await call(request, "import", { text: JSON.stringify(initialState()) });
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ errors, issues, notes }, null, 2));
  console.log(`OVERLAY-AUDIT errors=${errors.length} issues=${issues.length}`);
  for (const n of notes) console.log(n);
});
