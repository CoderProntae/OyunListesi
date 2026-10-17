import { describe, expect, it } from "vitest";
import { settingsSchema } from "../electron/validation";
import { defaultSettings } from "../shared/domain";
import { validationMessage } from "../shared/validation-text";
// 2.1.4: a rejected value is explained in Turkish with the field's own name.
// Before, Zod's JSON dump ("code": "too_small", "Number must be greater than
// or equal to 128") landed in the toast.
const rejected = (patch: Record<string, unknown>) => {
  try {
    settingsSchema.parse({ ...defaultSettings, ...patch });
    return "";
  } catch (e) {
    return validationMessage(e);
  }
};
describe("validation messages", () => {
  it("names the field and the limit", () => {
    const m = rejected({ maxTokens: 50 });
    expect(m).toContain("Geçersiz değer, hiçbir şey kaydedilmedi.");
    expect(m).toContain("Maksimum çıktı tokenı en az 128 olmalı.");
    expect(m).not.toContain("too_small");
    expect(m).not.toContain("{");
  });
  it("upper limits, enums and text lengths are readable too", () => {
    expect(rejected({ cacheHours: 99999 })).toContain(
      "Önbellek süresi en fazla 8.760 olmalı.",
    );
    expect(rejected({ toolMode: "yok" })).toContain(
      "Araç modu için listedeki seçeneklerden biri seçilmeli.",
    );
    expect(rejected({ lmUrl: 5 })).toContain("LM Studio temel adresi");
  });
  it("lists a few problems and keeps other errors as they are", () => {
    const m = rejected({ maxTokens: 1, fontSize: 99, radius: -5, blur: 900 });
    expect(m).toContain("Yazı boyutu en fazla 22 olmalı.");
    expect(m).toContain("Köşe yuvarlaklığı en az 0 olmalı.");
    // Three are shown, the rest is counted: a toast stays readable.
    expect(m).toContain("Ayrıca 1 alan daha.");
    expect(m).not.toContain("Maksimum çıktı tokenı");
    expect(validationMessage(new Error("Oyun kimliği bulunamadı."))).toBe(
      "Oyun kimliği bulunamadı.",
    );
    expect(validationMessage(undefined)).toBe("İşlem yapılamadı.");
  });
  it("a valid patch is not an error at all", () => {
    expect(rejected({ maxTokens: 20000, contextTokens: 27000 })).toBe("");
  });
});
