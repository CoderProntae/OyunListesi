import { vi } from "vitest";

// Unit tests never use the internet. A request a test did not mock (e.g. the
// web search fallback inside network.ts) fails at once instead of waiting for
// real search engines and timing out depending on the network of the day.
vi.mock("node:dns/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:dns/promises")>();
  const lookup = (async (host: string, options?: any) => {
    if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":"))
      return real.lookup(host, options);
    throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host} (birim testleri çevrimdışı)`), {
      code: "ENOTFOUND",
    });
  }) as typeof real.lookup;
  return { ...real, lookup, default: { ...real, lookup } };
});
