// 2.1.6: the overlay must be visible on top of the game (Little Nightmares 3
// report): topmost while the game — or its Ctrl+Tab panel — is in front, and
// back in the normal band as soon as another program is in front.
import { describe, expect, it } from "vitest";
import { overlayTopmost, type OverlayGame } from "../shared/overlay";

const game = (over: Partial<OverlayGame> = {}): OverlayGame => ({
  name: "Little Nightmares 3",
  exe: "C:\\Games\\LN3\\LN3.exe",
  pid: 4242,
  known: true,
  startedAt: new Date().toISOString(),
  foreground: true,
  ...over,
});

describe("2.1.6 oyun katmanı: en üstte olma kararı", () => {
  it("oyun öndeyken katman en üstte", () => {
    expect(overlayTopmost(game({ foreground: true }), false)).toBe(true);
  });
  it("panel açıkken oyun arkada olsa bile en üstte kalır", () => {
    expect(overlayTopmost(game({ foreground: false }), true)).toBe(true);
  });
  it("başka bir program öne geçince en üstten çıkar", () => {
    expect(overlayTopmost(game({ foreground: false }), false)).toBe(false);
  });
  it("oyun yokken (katman gizli) en üstte olmaz", () => {
    expect(overlayTopmost(undefined, false)).toBe(false);
    expect(overlayTopmost(undefined, true)).toBe(false);
  });
  it("simge durumuna küçülmüş oyun: pencere zaten gizli, karar değişmez", () => {
    expect(overlayTopmost(game({ foreground: false, visible: false }), false)).toBe(false);
    expect(overlayTopmost(game({ foreground: true, visible: false }), false)).toBe(true);
  });
});
