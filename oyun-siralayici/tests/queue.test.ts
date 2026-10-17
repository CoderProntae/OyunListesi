import { beforeEach, afterEach, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { Store } from "../electron/store";
import { Providers, MetadataQueue, CATALOG_VERSION } from "../electron/providers";
let store: Store, root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.resolve(".cache/test-queue-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});
it("cached metadata resets loading status without another request", async () => {
  const id = store.add([{ name: "Cached" }]).added[0];
  store.metadata(id, {
    updatedAt: new Date().toISOString(),
    catalogVersion: CATALOG_VERSION,
    catalogCheckedAt: new Date().toISOString(),
    fetchStatus: "loading",
  });
  const p = new Providers(store, () => "");
  const result = await p.enrich(id);
  expect(result.cached).toBe(true);
  expect(store.state.games[0].fetchStatus).toBe("done");
});
it("queue cancellation aborts current request and resets pending jobs", async () => {
  const ids = store.add([{ name: "A" }, { name: "B" }]).added;
  const p = new Providers(store, () => "");
  vi.spyOn(p, "enrich").mockImplementation(
    async (_id, _force, signal) =>
      new Promise((_r, reject) =>
        signal?.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      ),
  );
  const q = new MetadataQueue(p, store);
  q.add(ids);
  expect(q.state.running).toBe(true);
  q.cancel();
  await vi.waitFor(() => expect(q.state.running).toBe(false));
  expect(store.state.games.map((g) => g.fetchStatus)).toEqual(["idle", "idle"]);
  expect(q.jobs).toHaveLength(0);
  expect(q.state.cancelled).toBe(true);
});
it("data mutations remain bounded and reject repeated IDs", () => {
  const id = store.add([{ name: "A" }]).added[0];
  expect(() => store.remove([id, id])).toThrow("yinelenmemeli");
});
it("recovered native call history gets a cancellation result, never replayed actions", () => {
  const chat = store.createChat();
  chat.apiHistory = [
    { role: "user", content: "add" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "pending",
          type: "function",
          function: { name: "add_game", arguments: '{"name":"No replay"}' },
        },
      ],
    },
  ];
  const restored = store.validate(store.exportState());
  expect(restored.games).toHaveLength(0);
  expect(restored.chats[0].apiHistory.at(-1)).toMatchObject({
    role: "tool",
    tool_call_id: "pending",
  });
  expect(restored.chats[0].apiHistory.at(-1).content).toContain("cancelled");
});
