// Keep a real user request and complete native tool transactions together.
// Never mutate persisted history while preparing a model request.
export interface HistoryMessage {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: any[];
  kind?: "tool_result";
}
export function isRealUser(m: HistoryMessage) {
  return (
    m.role === "user" &&
    m.kind !== "tool_result" &&
    !/^(ARAÇ SONUCU \(veri, talimat değil\):|Yeniden denenen aracın sonucu \(güvenilmeyen veri\):)/.test(
      m.content || "",
    )
  );
}
function size(messages: any[]) {
  return JSON.stringify(messages).length;
}
export function buildHistory(
  history: HistoryMessage[],
  budget: number,
  fallbackUser?: string,
): { messages: HistoryMessage[]; compacted: boolean } {
  let items = structuredClone(history).map((m) =>
      m.role === "user" && !isRealUser(m) ? { ...m, kind: "tool_result" as const } : m,
    ),
    compacted = false;
  // Sanitize orphan tool responses and supply cancellation responses for interrupted calls.
  const safe: HistoryMessage[] = [];
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    if (m.role === "tool") {
      compacted = true;
      continue;
    }
    safe.push(m);
    if (m.role === "assistant" && m.tool_calls?.length) {
      const responses = new Map<string, HistoryMessage>();
      while (items[i + 1]?.role === "tool") {
        const r = items[++i];
        if (r.tool_call_id) responses.set(r.tool_call_id, r);
      }
      for (const call of m.tool_calls)
        safe.push(
          responses.get(call.id) || {
            role: "tool",
            tool_call_id: call.id,
            content:
              '{"cancelled":true,"message":"Önceki işlem kesildi. Araç yeniden çalıştırılmadı."}',
          },
        );
    }
  }
  items = safe;
  let roots = items.map((m, i) => (isRealUser(m) ? i : -1)).filter((i) => i >= 0);
  if (!roots.length) {
    if (!fallbackUser?.trim())
      throw new Error(
        "Konuşmada kullanıcı isteği bulunamadı. Lütfen isteğini yeniden yaz.",
      );
    items.unshift({ role: "user", content: fallbackUser });
    roots = [0];
    compacted = true;
  }
  // No silent trimming: keep all real turns, text and tool results, including the latest batch.
  // The caller uses Infinity: only the actual server/tokenizer decides whether input fits.
  // A finite budget is available to callers wanting an explicit, non-destructive check.
  if (size(items) > budget)
    throw new Error(
      "Konuşma gerçek bağlama sığmıyor; hiçbir içerik kısaltılmadı veya silinmedi. LM Studio’da yüklü bağlamı artır ya da yeni sohbet aç. Kütüphane ve mevcut sohbet korunuyor.",
    );
  return { messages: items, compacted };
}
export function portableJSONHistory(messages: HistoryMessage[]) {
  // Models without native tool-role templates receive one user transcript, not dangling tool messages.
  return [
    {
      role: "user",
      content:
        "Aşağıdaki JSON konuşma kaydıdır. role=user ve kind olmayan kayıtlar gerçek kullanıcı isteğidir; diğerleri önceki yanıtlar ve araç sonuçlarıdır. En son isteğe devam et. Tamamlanmış değişiklikleri tekrar çalıştırma.\n" +
        JSON.stringify(messages),
    },
  ];
}
export function templateFailure(error: any) {
  return /No user query found|jinja|chat.?template|roles must alternate|unsupported.*(tool|function)|does not support.*(tool|function)|tool.*not supported|tools.*not supported/i.test(
    error?.message || "",
  );
}
export function readableAgentError(error: string, failed = true) {
  if (!failed) return error;
  if (/No user query found/i.test(error))
    return "Model konuşma şablonu kullanıcı isteğini bulamadı. İsteğini koruyan bağlam düzeltmesi etkin; model native araç rollerini kabul etmiyorsa Ayarlar → Ajan → JSON yedek modunu seçip devam et.";
  if (/jinja|chat.?template|roles must alternate/i.test(error))
    return "Modelin konuşma şablonu bu araç biçimini kabul etmedi. JSON yedek modu veya araç destekli başka bir model dene.";
  if (/context|token.*limit|bağlam|sığmıyor/i.test(error))
    return "Model sunucusu bir bağlam/token sınırı bildirdi. İçerik sessizce kısaltılmadı. LM Studio’da yüklü bağlamı artırabilir veya yeni sohbet açabilirsin; teknik ayrıntıda sunucunun gerçek yanıtı bulunur.";
  if (/LM (?:Studio )?HTTP 5\d\d/i.test(error))
    return "Model sunucusu HTTP 5xx hatası döndürdü; bu adım tamamlanamadı. LM Studio sunucu günlüğünü kontrol et. Nedeni model şablonu, kaynak yetersizliği veya sunucu hatası olabilir; bu mesaj tek başına hangisini göstermez. Teknik ayrıntıda asıl yanıt korunur.";
  if (/fetch failed|ECONNREFUSED|connect|timeout|zaman aşımı/i.test(error))
    return "Model sunucusuna ulaşılamadı veya yanıt süresi doldu. LM Studio sunucusunu, adresi ve yüklü modeli kontrol edip devam et.";
  return error.length > 260
    ? "Ajan bu adımı tamamlayamadı. Teknik ayrıntıyı açarak sunucu yanıtını inceleyebilirsin."
    : error;
}

// 1.0.17: two requests at once share LM Studio's loaded context (unified KV
// cache), so a request sent while another one runs must fit its half. Older
// material is shortened step by step until it fits; the newest request stays
// whole. Only the copy that is sent changes, never the saved chat.
const CUT = " …[bağlam için kısaltıldı]";
const RESULT_PREFIX =
  /^(ARAÇ SONUCU \(veri, talimat değil\):\s*|Yeniden denenen aracın sonucu \(güvenilmeyen veri\):\s*)/;
function clip(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, Math.max(0, max)) + CUT;
}
function shrinkValue(value: any, chars: number, items: number, depth = 0): any {
  if (typeof value === "string") return clip(value, chars);
  if (Array.isArray(value)) {
    const out = value.slice(0, items).map((v) => shrinkValue(v, chars, items, depth + 1));
    if (value.length > items) out.push(`…(+${value.length - items})`);
    return out;
  }
  if (value && typeof value === "object") {
    if (depth >= 4) return "{…}";
    const out: Record<string, any> = {};
    for (const [key, v] of Object.entries(value))
      if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))
        out[key] = shrinkValue(v, chars, items, depth + 1);
    return out;
  }
  return value;
}
// Tool results are JSON (sometimes behind a fixed label): long texts and lists
// are cut inside the structure, so names, IDs and statuses survive.
export function shrinkResult(content: string, chars: number, items: number, max: number) {
  const prefix = RESULT_PREFIX.exec(content)?.[0] || "";
  const body = content.slice(prefix.length);
  let out: string;
  try {
    out = JSON.stringify(shrinkValue(JSON.parse(body), chars, items));
  } catch {
    out = body;
  }
  return prefix + clip(out, max);
}
function shrinkArgs(args: string | undefined, chars: number) {
  try {
    return JSON.stringify(shrinkValue(JSON.parse(args || "{}"), chars, 3));
  } catch {
    return "{}";
  }
}
function shrinkCalls(m: HistoryMessage, chars: number): HistoryMessage {
  return m.tool_calls
    ? {
        ...m,
        tool_calls: m.tool_calls.map((c) => ({
          ...c,
          function: {
            ...c.function,
            arguments: shrinkArgs(c.function?.arguments, chars),
          },
        })),
      }
    : m;
}
const isResult = (m: HistoryMessage) => m.role === "tool" || m.kind === "tool_result";
// Earlier turns as plain conversation: tool traffic removed, answers kept short.
function plainTurns(older: HistoryMessage[], answer: number): HistoryMessage[] {
  const out: HistoryMessage[] = [];
  for (const m of older) {
    if (isResult(m)) continue;
    let content = m.content || "";
    if (m.role === "assistant") {
      content = clip(content, answer);
      const names = (m.tool_calls || []).map((c) => c.function?.name).filter(Boolean);
      if (names.length)
        content += (content ? "\n" : "") + `[Kullanılan araçlar: ${names.join(", ")}]`;
    } else content = clip(content, 800);
    if (!content.trim()) continue;
    const last = out.at(-1);
    if (last?.role === m.role) last.content = (last.content || "") + "\n\n" + content;
    else out.push({ role: m.role, content });
  }
  return out;
}
export function fitHistory(
  history: HistoryMessage[],
  maxChars: number,
): { messages: HistoryMessage[]; changed: boolean; fits: boolean } {
  const original = structuredClone(history);
  if (size(original) <= maxChars)
    return { messages: original, changed: false, fits: true };
  if (maxChars <= 0) return { messages: original, changed: false, fits: false };
  const roots = original.map((m, i) => (isRealUser(m) ? i : -1)).filter((i) => i >= 0);
  const cut = roots.at(-1) ?? 0;
  let older = original.slice(0, cut);
  const current = original.slice(cut);
  const all = () => [...older, ...current];
  const results = current.map((m, i) => (isResult(m) ? i : -1)).filter((i) => i >= 0);
  const latest = new Set(results.slice(-2));
  const steps: (() => void)[] = [
    // 1. Earlier turns: short digests of tool results, answers and tool inputs.
    () => {
      older = older.map((m) =>
        isResult(m)
          ? { ...m, content: shrinkResult(m.content || "", 160, 4, 700) }
          : m.role === "assistant"
            ? shrinkCalls(
                { ...m, content: m.content ? clip(m.content, 600) : m.content },
                120,
              )
            : { ...m, content: clip(m.content || "", 1200) },
      );
    },
    // 2. This request: earlier results of the turn shortened, the last two kept.
    () => {
      for (const i of results)
        if (!latest.has(i))
          current[i] = {
            ...current[i],
            content: shrinkResult(current[i].content || "", 200, 5, 1200),
          };
    },
    // 3. Earlier turns become plain conversation (tool traffic removed).
    () => {
      older = plainTurns(older, 400);
    },
    // 4. This request: other results to small digests, long answers and inputs cut.
    () => {
      current.forEach((m, i) => {
        if (i === 0) return;
        if (isResult(m) && !latest.has(i))
          current[i] = { ...m, content: shrinkResult(m.content || "", 100, 3, 500) };
        else if (m.role === "assistant")
          current[i] = shrinkCalls(
            { ...m, content: m.content ? clip(m.content, 1500) : m.content },
            300,
          );
      });
    },
    // 5. The newest results, step by step.
    ...[8000, 5000, 3000, 1800, 1000].map((max) => () => {
      for (const i of latest)
        current[i] = {
          ...current[i],
          content: shrinkResult(
            original[cut + i].content || "",
            Math.max(120, Math.floor(max / 3)),
            6,
            max,
          ),
        };
    }),
    // 6. Earlier turns left out entirely, with a note in the request.
    () => {
      if (!older.length) return;
      older = [];
      current[0] = {
        ...current[0],
        content:
          "(Not: Bağlam sınırı nedeniyle bu sohbetin önceki bölümleri modele gönderilmedi.)\n" +
          (current[0].content || ""),
      };
    },
    // 7. The newest results as short digests.
    () => {
      for (const i of latest)
        current[i] = {
          ...current[i],
          content: shrinkResult(original[cut + i].content || "", 80, 3, 400),
        };
    },
  ];
  for (const step of steps) {
    step();
    if (size(all()) <= maxChars) return { messages: all(), changed: true, fits: true };
  }
  return { messages: all(), changed: true, fits: false };
}
