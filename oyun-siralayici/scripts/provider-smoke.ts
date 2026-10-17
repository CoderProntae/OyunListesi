// Opt-in live checks. Contacts public catalogs; NOT part of deterministic unit tests.
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
import { Providers } from "../electron/providers";
async function main() {
  const root = fs.mkdtempSync(path.resolve(".cache/provider-smoke-"));
  const store = new Store(root),
    providers = new Providers(store, () => "");
  try {
    const names = process.argv.slice(2).length
      ? process.argv.slice(2)
      : ["Stardew Valley", "Fortnite", "Portal 2"];
    for (const name of names) {
      const id = store.add([{ name }]).added[0];
      await providers.enrich(id, true, AbortSignal.timeout(110000));
      const g = store.requireGames([id])[0];
      console.log(
        JSON.stringify(
          {
            name: g.name,
            fetchStatus: g.fetchStatus,
            hasDescription: !!g.description,
            coverCached: !!g.cover,
            checks: g.storeChecks,
            stores: g.stores,
            hltb: g.hltb,
            minimum: g.minimum,
            recommended: g.recommended,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
void main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
