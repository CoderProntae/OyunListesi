// A validation error reaches the user as a toast. Zod's own text is an English
// JSON dump ("code": "too_small", "message": "Number must be greater than or
// equal to 128"), so every issue is turned into one Turkish sentence that names
// the field the way the window names it (2.1.4).
const labels: Record<string, string> = {
  // Ayarlar → LM Studio
  lmUrl: "LM Studio temel adresi",
  lmModel: "Model",
  temperature: "Sıcaklık",
  maxTokens: "Maksimum çıktı tokenı",
  contextTokens: "Yüklü bağlam",
  toolMode: "Araç modu",
  reasoning: "Düşünme düzeyi",
  // Ayarlar → Görünüm
  theme: "Tema",
  accent: "Vurgu rengi",
  fontSize: "Yazı boyutu",
  fontFamily: "Yazı tipi",
  density: "Liste yoğunluğu",
  radius: "Köşe yuvarlaklığı",
  animationSpeed: "Animasyon hızı",
  opacity: "Pencere opaklığı",
  material: "Windows cam malzemesi",
  background: "Arka plan görseli",
  blur: "Arka plan bulanıklığı",
  // Ayarlar → Ajan, web, veriler
  systemPrompt: "Ek sistem yönergesi",
  searchProvider: "Arama sağlayıcısı",
  searxUrl: "SearXNG temel adresi",
  cacheHours: "Önbellek süresi",
  // Ayarlar → Donanım
  os: "İşletim sistemi",
  osVersion: "OS sürümü",
  architecture: "Mimari",
  cpu: "İşlemci modeli",
  gpu: "Ekran kartı modeli",
  cores: "Fiziksel çekirdek",
  threads: "İş parçacığı",
  clockGHz: "CPU hızı",
  vramGB: "VRAM",
  ramGB: "RAM",
  diskFreeGB: "Boş disk alanı",
  diskName: "Disk",
  directX: "GPU DirectX özellik düzeyi",
  directXInstalled: "Yüklü DirectX",
  vulkan: "Vulkan bilgisi",
  // Oyun alanları
  name: "Oyun adı",
  rating: "Puan",
  playHours: "Oynama süresi",
  tags: "Etiketler",
  year: "Yıl",
  status: "Durum",
  reqVerdict: "Gereksinim kararı",
  minimum: "Minimum gereksinim",
  recommended: "Önerilen gereksinim",
  text: "Metin",
  url: "Adres",
  query: "Arama",
  ids: "Seçim",
};
const value = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("tr-TR") : String(v ?? "");
function sentence(issue: any): string {
  const path: unknown[] = Array.isArray(issue?.path) ? issue.path : [];
  const key = path.length ? String(path[path.length - 1]) : "";
  const field =
    labels[key] || (path.length > 1 ? labels[String(path[0])] : "") || "Bu alan";
  switch (issue?.code) {
    case "too_small":
      return issue.type === "string"
        ? `${field} en az ${value(issue.minimum)} karakter olmalı.`
        : `${field} en az ${value(issue.minimum)} olmalı.`;
    case "too_big":
      return issue.type === "string"
        ? `${field} en fazla ${value(issue.maximum)} karakter olmalı.`
        : `${field} en fazla ${value(issue.maximum)} olmalı.`;
    case "invalid_enum_value":
      return `${field} için listedeki seçeneklerden biri seçilmeli.`;
    case "invalid_type":
      return issue.expected === "number"
        ? `${field} bir sayı olmalı.`
        : `${field} için geçerli bir değer yaz.`;
    case "invalid_string":
      return issue.validation === "url"
        ? `${field} geçerli bir web adresi olmalı.`
        : `${field} biçimi geçersiz.`;
    case "unrecognized_keys":
      return `Bilinmeyen alan: ${(issue.keys || []).join(", ")}.`;
    case "invalid_union":
      return `${field} için gönderilen değer kabul edilmedi.`;
    default:
      return issue?.message && !/^\[?\s*\{/.test(String(issue.message))
        ? `${field}: ${issue.message}`
        : `${field} için gönderilen değer kabul edilmedi.`;
  }
}
// Non-validation errors keep their own (already Turkish) message.
export function validationMessage(error: unknown): string {
  const issues = (error as any)?.issues;
  if (!Array.isArray(issues) || !issues.length)
    return (error as Error)?.message || "İşlem yapılamadı.";
  const shown = issues.slice(0, 3).map(sentence);
  return (
    "Geçersiz değer, hiçbir şey kaydedilmedi. " +
    shown.join(" ") +
    (issues.length > shown.length
      ? ` Ayrıca ${issues.length - shown.length} alan daha.`
      : "")
  );
}
