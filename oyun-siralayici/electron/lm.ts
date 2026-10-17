import type { Settings, ModelInfo } from "../shared/types";
export interface Call {
  id: string;
  name: string;
  arguments: string;
}
export interface Completion {
  text: string;
  thinking: string;
  calls: Call[];
  finishReason?: string;
  promptTokens?: number;
}
export function nativeBase(url: string) {
  const u = new URL(url);
  u.pathname = u.pathname.replace(/\/v1\/?$/, "").replace(/\/$/, "") + "/api/v1";
  u.search = "";
  u.hash = "";
  return u.toString().replace(/\/$/, "");
}
export class LMClient {
  constructor(
    private settings: () => Settings,
    private key: () => string,
  ) {}
  private headers() {
    return {
      "Content-Type": "application/json",
      ...(this.key() ? { Authorization: `Bearer ${this.key()}` } : {}),
    };
  }
  async models(signal?: AbortSignal): Promise<ModelInfo[]> {
    const s = this.settings(),
      r = await fetch(s.lmUrl + "/models", {
        headers: this.headers(),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
        redirect: "error",
      });
    if (!r.ok)
      throw new Error(
        `LM Studio HTTP ${r.status}. Sunucuyu ve API anahtarını kontrol et.`,
      );
    const j = (await r.json()) as any;
    const models: ModelInfo[] = (j.data || []).map((m: any) => ({
      id: m.id,
      name: m.id,
      loaded: null,
      context: null,
      tools: null,
      reasoning: [],
    }));
    try {
      const r2 = await fetch(nativeBase(s.lmUrl) + "/models", {
        headers: this.headers(),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (r2.ok) {
        const j2 = (await r2.json()) as any;
        for (const m of j2.models || []) {
          if (m.type && m.type !== "llm") continue;
          const instances = m.loaded_instances || [];
          const ids = instances.length ? instances.map((i: any) => i.id) : [m.key];
          for (const id of ids) {
            const info: ModelInfo = {
              id,
              name: m.display_name || m.key || id,
              loaded: instances.length > 0,
              context:
                instances.find((i: any) => i.id === id)?.config?.context_length || null,
              tools: m.capabilities?.trained_for_tool_use ?? null,
              reasoning: m.capabilities?.reasoning?.allowed_options || [],
              defaultReasoning: m.capabilities?.reasoning?.default,
            };
            const existing = models.find((x) => x.id === id || x.id === m.key);
            if (existing) Object.assign(existing, info);
            else models.push(info);
          }
        }
      }
    } catch {
      /* Old LM Studio exposes only the OpenAI endpoint. */
    }
    return models.filter((m) => typeof m.id === "string");
  }
  async stream(
    messages: any[],
    tools: any[] | undefined,
    signal: AbortSignal,
    onDelta: (type: "text" | "thinking", text: string) => void,
    nativeReasoning = false,
  ): Promise<Completion> {
    const s = this.settings();
    if (!s.lmModel) throw new Error("Önce Ayarlar → LM Studio bölümünde bir model seç.");
    const body = nativeReasoning
      ? {
          model: s.lmModel,
          system_prompt: messages.find((m) => m.role === "system")?.content,
          input: JSON.stringify(messages.filter((m) => m.role !== "system")),
          stream: true,
          store: false,
          integrations: [],
          temperature: Math.min(s.temperature, 1),
          max_output_tokens: s.maxTokens,
          reasoning: s.reasoning,
        }
      : {
          model: s.lmModel,
          messages,
          temperature: s.temperature,
          max_tokens: s.maxTokens,
          stream: true,
          ...(tools ? { tools, tool_choice: "auto" } : {}),
        };
    const r = await fetch(
      nativeReasoning ? nativeBase(s.lmUrl) + "/chat" : s.lmUrl + "/chat/completions",
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
        redirect: "error",
      },
    );
    if (!r.ok) {
      const text = (await r.text()).slice(0, 1200);
      throw Object.assign(new Error(`LM Studio HTTP ${r.status}: ${text}`), {
        status: r.status,
      });
    }
    if (!r.body) throw new Error("Model boş yanıt döndürdü.");
    let promptTokens: number | undefined;
    let text = "",
      thinking = "",
      buffer = "";
    const calls = new Map<number, Call>();
    let finishReason: string | undefined;
    let ended = false,
      inlineThinking = false,
      contentBuffer = "";
    const decoder = new TextDecoder();
    const emit = (type: "text" | "thinking", s: string) => {
      if (typeof s !== "string") return;
      if (type === "text") text += s;
      else thinking += s;
      if (text.length > 1_000_000 || thinking.length > 1_000_000)
        throw new Error(
          "Tek yanıt güvenli kayıt boyutunu aştı (1 milyon karakter); araç sayısı sınırı değil.",
        );
      onDelta(type, s);
    };
    const contentDelta = (chunk: string, flush = false) => {
      contentBuffer += chunk;
      while (contentBuffer) {
        const tag = inlineThinking ? "</think>" : "<think>";
        const index = contentBuffer.indexOf(tag);
        if (index >= 0) {
          emit(inlineThinking ? "thinking" : "text", contentBuffer.slice(0, index));
          contentBuffer = contentBuffer.slice(index + tag.length);
          inlineThinking = !inlineThinking;
          continue;
        }
        let keep = 0;
        if (!flush) {
          for (let k = 1; k < tag.length; k++)
            if (contentBuffer.endsWith(tag.slice(0, k))) keep = k;
        }
        const end = contentBuffer.length - keep;
        if (end > 0) {
          emit(inlineThinking ? "thinking" : "text", contentBuffer.slice(0, end));
          contentBuffer = contentBuffer.slice(end);
        }
        break;
      }
    };
    const event = (chunk: string) => {
      const lines = chunk.split("\n");
      const raw = lines
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!raw) return;
      if (raw.trim() === "[DONE]") {
        ended = true;
        return;
      }
      let j: any;
      try {
        j = JSON.parse(raw);
      } catch {
        throw new Error("Model bozuk SSE JSON gönderdi.");
      }
      if (j.error || j.type === "error")
        throw new Error(
          typeof j.error === "string"
            ? j.error
            : j.error?.message || j.message || "Model akış hatası.",
        );
      const usage = j.usage || j.result?.usage || j.stats || j.result?.stats;
      const counted = Number(usage?.prompt_tokens ?? usage?.input_tokens);
      if (counted > 0) promptTokens = counted;
      if (nativeReasoning) {
        const type =
          j.type ||
          lines
            .find((l) => l.startsWith("event:"))
            ?.slice(6)
            .trim();
        if (type === "message.delta") emit("text", j.content);
        if (type === "reasoning.delta") emit("thinking", j.content);
        if (type === "chat.end") {
          ended = true;
          if (!text)
            for (const output of j.output || j.result?.output || []) {
              if (output.type === "message") emit("text", output.content);
            }
        }
        return;
      }
      const choice = j.choices?.[0];
      const d = choice?.delta;
      if (choice?.finish_reason) {
        ended = true;
        finishReason = choice.finish_reason;
      }
      if (!d) return;
      contentDelta(d.content || "");
      emit("thinking", d.reasoning_content || d.reasoning || "");
      for (const t of d.tool_calls || []) {
        const old = calls.get(t.index) || { id: "", name: "", arguments: "" };
        old.id += t.id || "";
        old.name += t.function?.name || "";
        if (old.id.length > 300 || old.name.length > 100)
          throw new Error("Araç kimliği veya adı çok uzun.");
        old.arguments += t.function?.arguments || "";
        if (old.arguments.length > 50000)
          throw new Error("Araç girdisi boyut sınırını aştı.");
        calls.set(t.index, old);
      }
      if (choice.finish_reason) ended = true;
    };
    for await (const bytes of r.body as any) {
      signal.throwIfAborted();
      buffer += decoder.decode(bytes, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      if (buffer.length > 4_000_000 && !buffer.includes("\n\n"))
        throw new Error("Tek SSE çerçevesi bellek sınırını aştı.");
      let cut;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        event(buffer.slice(0, cut));
        buffer = buffer.slice(cut + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) event(buffer);
    contentDelta("", true);
    if (!ended)
      throw new Error("Model akışı tamamlanmadan kapandı. Araçlar çalıştırılmadı.");
    return {
      text,
      thinking,
      ...(finishReason ? { finishReason } : {}),
      ...(promptTokens ? { promptTokens } : {}),
      calls: [...calls.values()].map((c, i) => ({
        ...c,
        id: c.id || `call_${Date.now()}_${i}`,
      })),
    };
  }
  async shortSummary(name: string, description: string, signal: AbortSignal) {
    const s = this.settings();
    const r = await fetch(s.lmUrl + "/chat/completions", {
      method: "POST",
      headers: this.headers(),
      signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
      redirect: "error",
      body: JSON.stringify({
        model: s.lmModel,
        stream: false,
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          {
            role: "system",
            content:
              "Oyunu 2–3 kısa Türkçe cümleyle özetle. Açıklama verilmişse onu kullan; yoksa bildiğin oyun bilgisinden yararlan. Bilmediğin ayrıntıları uydurma. Yalnızca özeti yaz.",
          },
          {
            role: "user",
            content: JSON.stringify({
              name,
              officialDescription: description.slice(0, 9000),
            }),
          },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Özet üretilemedi: LM HTTP ${r.status}`);
    const j = (await r.json()) as any;
    const text = j.choices?.[0]?.message?.content
      ?.trim()
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
    if (!text || /<think>/i.test(text))
      throw new Error(
        "Model tamamlanmış özet metni üretmedi; token sınırını veya model ayarını kontrol et.",
      );
    return text.slice(0, 2500);
  }
}
