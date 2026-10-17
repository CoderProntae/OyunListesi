// Live end-to-end check (not shipped): adds real games the way "Oyun ekle"
// does (platform → game) into a temporary library and runs the app's own
// metadata refresh, then prints what the Sistem table would show.
//   npx tsx scripts/live-platform-smoke.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../electron/store";
import { Providers } from "../electron/providers";
import { compatibility } from "../shared/compatibility";
import { platformLabel } from "../shared/format";
import { initialState } from "../shared/domain";
import type { Game } from "../shared/types";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "oyun-live-"));
const store = new Store(root);
const providers = new Providers(store, () => "");
store.hardware({
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
});
const items: { name: string; origin?: Game["origin"]; appId?: number }[] = [
  { name: "Kane and Lynch: Dead Men", origin: { store: "Steam", id: "8080" } },
  { name: "Kane & Lynch 2: Dog Days", origin: { store: "Steam", id: "28000" } },
  { name: "Max Payne", origin: { store: "Steam", id: "12140" } },
  { name: "Terraria", origin: { store: "Steam", id: "105600" } },
  { name: "Fallout 2", origin: { store: "GOG", id: "1440166436" } },
  {
    name: "Hades",
    origin: { store: "Epic Games", id: "2ae6edb2223c4f8c97e9839b5b6497bb" },
  },
  { name: "Halo Infinite", origin: { store: "Xbox", id: "9PP5G1F0C2B6" } },
  { name: "Spider-Man", origin: { store: "My Abandonware", id: "/game/spider-man-3qc" } },
  { name: "Kendi oyunum", origin: { store: "none" } },
];
(async () => {
  let failures = 0;
  for (const item of items) {
    const id = store.add([{ ...item, steamMatchMode: "manual" }]).added[0];
    try {
      await providers.enrich(id, true);
    } catch (e) {
      failures++;
      console.log("HATA", item.name, (e as Error).message);
      continue;
    }
    const g = store.requireGames([id])[0];
    const c = compatibility(g, store.state.hardware);
    const show = (rows: typeof c.minimum) =>
      rows.map((r) => `${r.name}=${r.required}`).join(" | ") || "—";
    console.log(`\n${g.name} · ${g.origin?.store}`);
    console.log(`  Platform: ${g.platforms.map(platformLabel).join(" / ") || "—"}`);
    console.log(`  Minimum : ${show(c.minimum)}`);
    console.log(
      `  Önerilen: ${c.recommended.length ? show(c.recommended) : "(sütun yok)"}`,
    );
    console.log(
      `  Kaynak: ${g.requirementSource?.store || "yok"} · Mağazalar: ${(g.storeChecks || []).map((s) => `${s.store}:${s.status}`).join(", ") || "sorulmadı"} · HLTB: ${g.hltb?.status}${g.hltb?.main ? " " + g.hltb.main + " sa" : ""}`,
    );
    if (!g.description && item.origin?.store !== "none") console.log("  ! açıklama yok");
  }
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
  process.exitCode = failures ? 1 : 0;
})();
