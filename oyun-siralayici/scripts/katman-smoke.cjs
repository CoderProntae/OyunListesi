// Oyun içi katman duman testi (Wine + sahte oyunlar):
//   d3d12 → erken enjeksiyon + fabrika kancası + D3D12 arka ucu (çizim doğrulanır)
//   d3d9  → erken enjeksiyon + Direct3DCreate9 IAT kancası + D3D9 arka ucu
//   gl    → erken enjeksiyon + wglSwapBuffers IAT kancası + OpenGL arka ucu
//   d3d11 → Wine sınırı nedeniyle "atlandı" dönebilir (geç enjeksiyon/kukla
//           cihaz yalnız gerçek Windows'ta doğrulanabilir)
// Gerekli araçlar yoksa test atlanır (paketleme bloklanmaz).
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;

if (!has("wine") || !has("x86_64-w64-mingw32-gcc") || !has("Xvfb")) {
  console.log("katman smoke ATLANDI: wine/mingw/Xvfb yok");
  process.exit(0);
}
if (!fs.existsSync(path.join(root, "resources/overlay/oyun-katman64.dll"))) {
  console.log("katman smoke ATLANDI: DLL derlenmemis (scripts/build-katman.sh)");
  process.exit(0);
}

let failed = 0;
for (const api of ["d3d12", "d3d9", "gl", "d3d11"]) {
  const r = spawnSync("sh", [path.join(root, "tests/native/run-wine.sh")], {
    cwd: root,
    encoding: "utf8",
    timeout: 240000,
    env: { ...process.env, KATMAN_API: api },
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const line = out.split("\n").filter((l) => l.includes("SONUC=")).pop() || "SONUC=?";
  console.log(`katman smoke ${api}: ${line.trim()}`);
  if (line.includes("KALDI")) failed++;
}
process.exit(failed ? 1 : 0);
