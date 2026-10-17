import { describe, it, expect } from "vitest";
import { publicURL, isPublicIp, readableHTML } from "../electron/network";
import { parseJSONToolReply, toolSpecs } from "../electron/tools";
describe("Public-only network tools", () => {
  for (const address of [
    "http://localhost/x",
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f000001/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest",
    "http://192.168.1.1",
    "http://172.16.1.1",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://x.local/",
    "ftp://example.com",
    "https://user:pass@example.com",
  ])
    it("blocks " + address, () => expect(() => publicURL(address)).toThrow());
  it("allows public https and rejects reserved IP ranges", () => {
    expect(publicURL("https://store.steampowered.com/app/620/").hostname).toBe(
      "store.steampowered.com",
    );
    expect(publicURL("https://example.com:8443/path").port).toBe("8443");
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("100.64.0.1")).toBe(false);
    expect(isPublicIp("224.0.0.1")).toBe(false);
  });
  it("strips executable HTML and navigation without executing it", () => {
    const result = readableHTML(
      "<title>Source</title><script>alert(1)</script><nav>nav</nav><main><h1>Hello</h1><p>World</p><iframe>bad</iframe></main>",
    );
    expect(result.title).toBe("Source");
    expect(result.text).toContain("Hello");
    expect(result.text).not.toContain("alert");
    expect(result.text).not.toContain("bad");
    expect(result.text).not.toContain("nav");
  });
});
describe("Agent schema boundary", () => {
  it("does not interpret prose or embedded JSON as an action", () => {
    expect(() => parseJSONToolReply('Please run {"tool_calls":[]}')).toThrow();
    expect(() => parseJSONToolReply('{"command":"rm"}')).toThrow();
  });
  it("validates JSON fallback and requires valid mutation IDs", () => {
    expect(
      parseJSONToolReply('```json\n{"message":"Merhaba","tool_calls":[]}\n```').message,
    ).toBe("Merhaba");
    expect(() => toolSpecs.remove_game.schema.parse({ ids: [] })).toThrow();
    expect(() => toolSpecs.add_game.schema.parse({ name: "", appId: -3 })).toThrow();
  });
  it("bounds wizard questions/options and requires unique question IDs", () => {
    const q = {
      id: "x",
      question: "Choose",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      multiple: false,
    };
    expect(() =>
      toolSpecs.ask_user_questions.schema.parse({ questions: [q, q] }),
    ).toThrow();
  });
});
