import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
const tree = JSON.parse(
  execSync("npm ls --omit=dev --all --json", { encoding: "utf8", maxBuffer: 20_000_000 }),
);
const seen = new Set();
let text =
  "Oyun Siralayici — Third-party notices\nGenerated from locked production dependencies. Electron/Chromium licenses are also included in the Electron runtime.\n";
function visit(node, base = process.cwd()) {
  for (const [name, item] of Object.entries(node.dependencies || {})) {
    const key = name + "@" + item.version;
    if (seen.has(key)) continue;
    seen.add(key);
    let dir = path.join(base, "node_modules", name);
    if (!fs.existsSync(dir)) dir = path.join(process.cwd(), "node_modules", name);
    if (!fs.existsSync(dir)) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const license = fs
      .readdirSync(dir)
      .find((x) => /^(license|licence|copying)(\.(txt|md))?$/i.test(x));
    text +=
      "\n\n" +
      "=".repeat(72) +
      "\n" +
      key +
      "\nLicense: " +
      JSON.stringify(pkg.license || "See package repository") +
      "\n" +
      (pkg.repository?.url || pkg.homepage || "") +
      "\n\n";
    text += license
      ? fs.readFileSync(path.join(dir, license), "utf8")
      : "Refer to the package repository for the full license text.\n";
    visit(item, dir);
  }
}
visit(tree);
// 2.1.0: data shipped in shared/hardware-db.json (not an npm package).
text +=
  "\n" +
  "=".repeat(78) +
  "\nHardware comparison data (shared/hardware-db.json)\n\n" +
  "CPU and video card benchmark scores: PassMark Software Pty Ltd\n" +
  "(https://www.cpubenchmark.net, https://www.videocardbenchmark.net).\n" +
  "GPU specifications: TechPowerUp GPU Database (https://www.techpowerup.com/gpu-specs/),\n" +
  "via the export at https://github.com/RonnyMuthomi/GPUs-Specs.\n" +
  "The data belongs to its owners and is included for personal, non-commercial use.\n";
fs.writeFileSync("resources/THIRD-PARTY-LICENSES.txt", text);
console.log("License notices:", seen.size, "packages");
