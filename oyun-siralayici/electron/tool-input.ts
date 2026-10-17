// Recover only unambiguous JSON wrappers. Never guess missing fields or values.
export function decodeToolInput(raw: string): {
  args?: Record<string, unknown>;
  error?: string;
} {
  let value: unknown;
  const clean = raw.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
  try {
    value = JSON.parse(clean);
    // Some templates double-encode the entire arguments object.
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    return {
      error:
        "Araç girdisi geçerli JSON değil veya yarım kaldı. Hiçbir değişiklik yapılmadı. Eksik kısmı tahmin etmeden, arguments alanını tam bir JSON nesnesi olarak yeniden üret.",
    };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      error:
        "Araç girdisi JSON nesnesi olmalı; null, dizi veya tek değer gönderildi. Hiçbir değişiklik yapılmadı. arguments alanını gerekli alanları içeren bir nesne olarak yeniden üret.",
    };
  }
  return { args: value as Record<string, unknown> };
}
// Older chats can contain malformed native arguments, which some model templates
// try to JSON-decode. Repair only the outbound envelope, retaining the raw input
// and original result as data. Stored histories are never rewritten or trimmed.
export function transportToolHistory(messages: any[]) {
  const invalid = new Map<string, unknown>();
  const repaired = messages.map((m) => {
    if (m.role !== "assistant" || !m.tool_calls) return m;
    return {
      ...m,
      tool_calls: m.tool_calls.map((c: any) => {
        const raw = c.function?.arguments;
        const decoded = decodeToolInput(
          typeof raw === "string" ? raw : (JSON.stringify(raw) ?? ""),
        );
        if (decoded.error) invalid.set(c.id, raw);
        return {
          ...c,
          function: { ...c.function, arguments: JSON.stringify(decoded.args || {}) },
        };
      }),
    };
  });
  return repaired.map((m) =>
    m.role === "tool" && invalid.has(m.tool_call_id)
      ? {
          ...m,
          content: JSON.stringify({
            previousResult: m.content,
            rawArguments: invalid.get(m.tool_call_id),
            instruction:
              "Önceki araç girdisi bozuktu; aktarım zarfı düzeltildi, araç çalışmış sayılmaz. İsteğe uygun geçerli arguments nesnesi üret.",
          }),
        }
      : m,
  );
}
export function toolInputError(error: any) {
  if (!Array.isArray(error?.issues)) return error?.message || "Araç çalıştırılamadı.";
  return (
    "Araç girdisinin alanları geçersiz; değişiklik yapılmadı. " +
    error.issues
      .map((issue: any) => `${issue.path?.join(".") || "arguments"}: ${issue.message}`)
      .join("; ") +
    " Gerekli alanları düzelterek çağrıyı yeniden üret."
  );
}
