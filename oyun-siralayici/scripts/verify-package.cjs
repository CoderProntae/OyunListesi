const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const asar = require("@electron/asar");
const archive = path.resolve("../.cache/oyun-package/win-unpacked/resources/app.asar");
const local = require("../package.json");
const packaged = JSON.parse(asar.extractFile(archive, "package.json").toString());
assert.equal(packaged.version, local.version);
const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
const files = [...walk("electron-dist"), ...walk("dist")];
for (const file of files)
  assert.deepEqual(
    asar.extractFile(archive, file.replaceAll(path.sep, "/")),
    fs.readFileSync(file),
    file + " differs",
  );
for (const f of ["browser.html", "browser-ui.js", "browser-preload.cjs"])
  assert(files.includes(path.join("electron-dist", f)));
const pe = fs.readFileSync(
  path.resolve("../.cache/oyun-package/win-unpacked/Oyun Siralayici.exe"),
);
assert.equal(pe.toString("ascii", 0, 2), "MZ");
const header = pe.readUInt32LE(0x3c);
assert.equal(pe.toString("ascii", header, header + 4), "PE\x00\x00");
assert.equal(pe.readUInt16LE(header + 4), 0x8664);
console.log(
  JSON.stringify(
    {
      version: packaged.version,
      target: "Windows x64 (PE machine 0x8664)",
      asarCodeAndAssetsByteMatched: true,
      browserFilesPresent: true,
      checkedFiles: files,
    },
    null,
    2,
  ),
);
