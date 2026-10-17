#!/usr/bin/env python3
"""Publish a portable EXE to the in-app update channel.

Usage: python3 scripts/publish-update.py <exe> <version> <notes.md> [--url <already uploaded .gz>]

Uploads the EXE to x0.at (kept ~80 days for this size) and temp.sh (3 days,
mirror), checks that each address serves the exact bytes, then writes the
manifest (version, notes, size, SHA-256, addresses) to the Telegraph page the
app reads (.release/kanal.json holds the page and its edit key)."""
import hashlib, json, os, subprocess, sys, urllib.parse, urllib.request
exe, version, notes_file = sys.argv[1:4]
given = sys.argv[sys.argv.index("--url") + 1] if "--url" in sys.argv else None
conf = json.load(open(os.path.join(os.path.dirname(__file__), "..", ".release", "kanal.json")))
data = open(exe, "rb").read()
sha = hashlib.sha256(data).hexdigest()
size = len(data)
name = os.path.basename(exe)
def upload(cmd):
    # The host answers 502 now and then for large files: try three times.
    for _ in range(3):
        try:
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=1200).stdout.strip()
            if out.startswith("https://"):
                return out
        except Exception:
            pass
    return None
def verified(url):
    try:
        h = hashlib.sha256()
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "OyunSiralayici-Publisher"}), timeout=900) as r:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest() == sha
    except Exception as e:
        print("verify failed", url, e)
        return False
# x0.at refuses .exe files: the EXE travels gzip-compressed; the app unpacks
# it and checks size and SHA-256 of the EXE itself.
import gzip, zlib
gz = exe + ".gz"
with open(gz, "wb") as f:
    f.write(gzip.compress(data, compresslevel=6))
transfer = os.path.getsize(gz)
def verified(url):
    try:
        h = hashlib.sha256()
        d = zlib.decompressobj(16 + zlib.MAX_WBITS)
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "OyunSiralayici-Publisher"}), timeout=900) as r:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                h.update(d.decompress(chunk))
        h.update(d.flush())
        return h.hexdigest() == sha
    except Exception as e:
        print("verify failed", url, e)
        return False
urls = []
if given:
    if verified(given):
        urls.append(given)
else:
    for cmd in (["curl", "-s", "-m", "1200", "-F", f"file=@{gz}", "https://x0.at"],):
        url = upload(cmd)
        print("uploaded", url)
        if url and verified(url):
            urls.append(url)
os.remove(gz)
if not urls:
    sys.exit("no verified download address; manifest not changed")
manifest = {
    "channel": "oyun-siralayici",
    "version": version,
    "date": __import__("datetime").date.today().isoformat(),
    "notes": open(notes_file, encoding="utf-8").read(),
    "assets": [{"name": name, "size": size, "sha256": sha, "encoding": "gzip", "transferSize": transfer, "urls": urls}],
}
content = json.dumps([{"tag": "pre", "children": [json.dumps(manifest, ensure_ascii=False)]}], ensure_ascii=False)
body = urllib.parse.urlencode({
    "access_token": conf["telegraphToken"],
    "title": "Oyun Siralayici guncelleme kanali",
    "content": content,
}).encode()
with urllib.request.urlopen(urllib.request.Request(f"https://api.telegra.ph/editPage/{conf['page']}", data=body), timeout=60) as r:
    answer = json.load(r)
if not answer.get("ok"):
    sys.exit("telegraph: " + json.dumps(answer))
with urllib.request.urlopen(f"https://api.telegra.ph/getPage/{conf['page']}?return_content=true", timeout=60) as r:
    page = json.load(r)
text = "".join(c if isinstance(c, str) else "" for n in page["result"]["content"] for c in n.get("children", []))
assert json.loads(text)["version"] == version
print(json.dumps({"version": version, "size": size, "sha256": sha, "urls": urls}, indent=2))
