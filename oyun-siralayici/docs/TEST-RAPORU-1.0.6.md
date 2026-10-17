# Oyun Sıralayıcı 1.0.6 — test ve teslim raporu

**15 Ekim 2026 · Linux x64 · Node 22.22.0 · Electron 44.7.2**

| Kontrol | Sonuç |
|---|---|
| TypeScript | Geçti |
| Vitest birim/entegrasyon | **172 / 172**, 12 dosya |
| Playwright arayüz | **25 / 25** |
| Üretim Linux Electron: açılış, IPC, otonom varsayılan, ekle/sil/geri al | Geçti |
| Sekmeli Electron tarayıcı, adres, popup, geri/ileri, IPC/oturum ayrılığı | Geçti — yerel fixture web sunucusu |
| Eski kütüphane yükseltme + açıkça durdurma + yeniden açılış | Geçti — gerçek Linux Electron, iki fixture oyun |
| Masaüstü toplu/tek oyun araştırma ve durdurma IPC çağrıları | Geçti |
| Üç oyunda gerçek ajan araç döngüsü | Geçti — deterministik model ve arama yanıtları; sorgular/alan yazımları doğrulandı |
| Canlı genel yama araması | Max Payne / Hades: doğrudan `oyun adı türkçe yama`, DuckDuckGo onar aday döndürdü |
| `npm audit` | **0** bildirilen zafiyet |
| Windows x64 portable paket | Üretildi; iç uygulama PE machine `0x8664` |
| ASAR doğrulaması | Ana süreç, iki preload, tarayıcı HTML/JS, renderer/CSS dahil **8 dosya byte eşleşti** |
| Gerçek Windows / WMI / dxdiag / Mica / DPAPI / SmartScreen | **Test edilmedi** |
| Kullanıcının gerçek kütüphanesi ve gerçek LM Studio modeli | **Erişilmedi / test edilmedi** |
| Yama dosyalarını indirme, kurma, oyun içi çalışma | **Yapılmadı** |

## 1.0.6 regresyonları

`tests/revision106.test.ts` içinde 17 test:

- Tam `oyun adı türkçe yama` sorgusu; sabit WordPress kataloğu/site önceliği yok. Oyun adı/ilgili sözcük/numaralı devam oyunu filtresi uygulanmadan adayların iletimi.
- Hata, boş sonuç ve iptalin kesin “yama yok” olarak yazılmaması.
- Eski ve bitmiş oyunların, önceki `done`/`none` kayıtlarının ve otomasyon kapalı kütüphanenin bütünüyle bir defa kuyruğa alınması; yedek, kişisel not ve sıranın korunması.
- İçeri aktarılan eski kayıtlarda geçiş; mevcut sürümde eklenen yeni oyunların normal katalog/araştırma akışından geçmesi.
- Eski negatif yama sonucunun geçici gösterimi; yalnızca gerçek yama durumu yazıldığında bekleyen inceleme işaretinin temizlenmesi. Eski yanlış açıklamanın yeni durumun altında kalmaması.
- Yeni araştırma sohbeti açılması; eski sohbet/aktif kullanıcı sohbetinin korunması.
- 1.500 oyunu toplu kuyruğa alma/durdurmada oyun başına IPC güncellemesi yağmuru olmaması; boş kütüphane.
- Üç oyunun ajan tarafından ayrı ayrı aranması ve sonuçların `update_game_info` ile gerçekten kaydedilmesi; bitmiş oyun da dahil. Model/SSE ve arama cevapları **fixture**, canlı model başarısı iddiası değil.
- Açıkça durdurulmuş işin yeniden açılışta durması; yarıda kalmış `running` işin `queued` olarak devam etmesi.
- Electron preload izin listesiyle servis yöntemlerinin birebir eşleşmesi.

İki yeni UI testi eski negatif kaydın inceleme/önceki açıklama görünümünü, durdurma/yeniden yüklemeyi ve bütün oyunları yeniden araştır düğmesini doğrular. Önceki sıralama, sanallaştırma, seriler, toplu Steam seçimi, HLTB/Xbox, minimum/önerilen/optimum, otonom/isteğe bağlı onay, geri alma, Markdown ve ayrı sohbet testleri korunur.

## Native yükseltme testinde bulunan ve düzeltilen sorun

İlk native testte masaüstü preload listesi `researchGame`, `researchAll`, `stopResearch` yöntemlerini içermediğinden düğme çağrıları engellendi. Web önizlemesi aynı preload’u kullanmadığı için UI testleri bunu yakalamamıştı. Üç yöntem eklendi; liste eşitliği regresyon testi ve gerçek Electron düğme/IPC testleri geçti. Testin asenkron durum bekleme mantığı da `expect.poll` ile kesin durum kontrolüne dönüştürüldü. Son paket bu düzeltmeyi içerir.

## Canlı aramanın kapsamı

`docs/genel-yama-arama-1.0.6.jsonl` dosyası gerçek genel web sorgularını, sağlayıcıyı, tarihleri ve adayları içerir. Son çalıştırmada Max Payne için ilk sonuç Turkce-yama.com, Hades için DonanımHaber yama başlığı oldu. Bir site özellikle seçilmedi veya önce sorgulanmadı. Arama sonuçları bir yamanın güncelliğini/güvenliğini/oyun sürümüne uyumluluğunu kanıtlamaz.

Önceki aynı gün denemelerinde DuckDuckGo challenge ve Bing’de ilgisiz HBO Max/mitoloji sonuçları da görüldü. Başarılı son sorgu bu erişim ve alaka risklerini ortadan kaldırmaz. Engeller aşılmadı, sabit katalog kısayolu geri getirilmedi. Arama boş/engelli olursa otomatik olarak “yok” yazılmaz.

HLTB/Xbox/GOG/Epic için önceki 1.0.5 canlı kanıtları korunur; bu sürümde yeniden yapılmış gibi sunulmaz: `docs/TEST-RAPORU-1.0.5.md`, `docs/canli-saglayicilar-1.0.5.jsonl`.

## Kanıt dosyaları ve tekrar

- `docs/typecheck-1.0.6.txt`
- `docs/birim-testleri-1.0.6.txt`
- `docs/arayuz-testleri-1.0.6.txt`
- `docs/masaustu-test-1.0.6.txt`
- `docs/tarayici-test-1.0.6.txt`
- `docs/yukseltme-test-1.0.6.txt`
- `docs/toplu-arastirma-1.0.6.png`
- `docs/genel-yama-arama-1.0.6.jsonl`
- `docs/guvenlik-taramasi-1.0.6.txt`
- `docs/paket-dogrulama-1.0.6.json`

```bash
npm ci
npm run typecheck
npm test
npm run build
# UI için preview:server (4317) ve dev (5173) ayrı çalışır:
npm run test:ui
# Linux'ta Electron smoke:
xvfb-run -a node scripts/electron-smoke.cjs
xvfb-run -a node scripts/browser-smoke.cjs
xvfb-run -a node scripts/upgrade-smoke.cjs
node scripts/verify-package.cjs
# İsteğe bağlı gerçek ağ:
npx tsx scripts/patch-search-live.ts
npm audit
```

## Teslim sınırı

Yeni EXE ilk açılışta mevcut eski kayıtları araştırma kuyruğuna alır; model yoksa bekler. Bu ortamda kullanıcının bilgisayarındaki oyunların araştırıldığı veya bütün yamaların bulunduğu söylenemez. Windows paketi çapraz üretildi ve içeriği doğrulandı, **Windows üzerinde çalıştırılmadı**. EXE dijital imzasızdır. Son dosya adları/boyut/EXE SHA-256 `BUILD-INFO.json`, indirilebilir dosya özetleri dağıtımın `SHA256.txt` dosyasındadır.
