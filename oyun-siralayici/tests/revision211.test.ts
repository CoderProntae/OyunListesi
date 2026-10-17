import { describe, expect, it } from "vitest";
import { cleanError } from "../shared/format";
// 2.1.1: interface fixes around the in-game indicator. Error texts shown to
// the user never carry Electron's IPC wrapper.
describe("cleanError", () => {
  it("unwraps the Electron IPC prefix", () => {
    expect(cleanError(new Error("Error invoking remote method 'app:call': Error: Oyun kimliği bulunamadı."))).toBe(
      "Oyun kimliği bulunamadı.",
    );
    expect(cleanError(new Error("Error invoking remote method 'overlay:call': Error: Bilinmeyen katman işlemi."))).toBe(
      "Bilinmeyen katman işlemi.",
    );
  });
  it("keeps plain messages and stringifies the rest", () => {
    expect(cleanError(new Error("Bağlantı kurulamadı."))).toBe("Bağlantı kurulamadı.");
    expect(cleanError("Zaten hazır.")).toBe("Zaten hazır.");
    expect(cleanError(undefined)).toBe("İşlem tamamlanamadı.");
    expect(cleanError(new Error(""))).toBe("İşlem tamamlanamadı.");
  });
});
