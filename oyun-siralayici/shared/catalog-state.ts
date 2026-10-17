import type { CompletionTimes, Game, StoreCheck } from "./types";
import { isStoreProductLink } from "./links";

export function hasCompletionHours(value?: Partial<CompletionTimes>): boolean {
  return (
    !!value &&
    [value.main, value.mainExtra, value.completionist, value.allStyles].some(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
    )
  );
}

// Also handles libraries written before store writes and catalog checks were synchronized.
// An explicitly newer negative/ambiguous catalog result still wins.
export function effectiveStoreCheck(
  game: Game,
  name: StoreCheck["store"],
): StoreCheck | undefined {
  const check = game.storeChecks?.find((c) => c.store === name);
  const store = game.stores.find((s) => s.name === name);
  const edited = game.aiEditedFields?.includes("stores") ? game.aiEditedAt : undefined;
  const checkedAt = store?.checkedAt || edited;
  if (
    store?.verified &&
    isStoreProductLink(name, store.url) &&
    (!check || (checkedAt && Date.parse(checkedAt) >= Date.parse(check.checkedAt)))
  ) {
    return {
      store: name,
      status: "found",
      checkedAt: checkedAt || "",
      source: store.source || "Kayıtlı ürün",
      url: store.url,
    };
  }
  return check;
}
