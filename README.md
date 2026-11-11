# NetVera AI IDE

**Windows için üç asistanlı kodlama çalışma alanı.** Normal ChatGPT, Claude ve Gemini sohbet hesaplarıyla çoklu tartışma/inceleme iş akışını geliştirmek için temel alınmıştır.

## Bu ilk commit'te gerçekten ne var?

- **Multi-AI Chat Desktop kaynak kodu** (deponun kökü): sağlayıcı web oturumları ve çoklu iş akışları, mevcut lisans/NOTICE korunmuştur.
- **OpenBrowser kaynak kodu** (`integrations/openbrowser/`): ayrı CLI/Chrome eklentisi, mevcut MIT lisansı korunmuştur. Henüz masaüstü uygulamasına tam bağlı değildir.
- **NetVera çalışma alanı paneli** (`src/netvera/WorkspaceDock.tsx`): proje klasörü, dosya listesi, metin dosyası düzenleme, açık kullanıcı onayıyla kaydetme ve terminal komutları.
- **Tauri yerel çalışma alanı komutları** (`src-tauri/src/workspace.rs`): klasör sınırlaması, UTF-8 dosya okuma/yazma, elle başlatılan terminal komutları. Sistem komutları asistan çıktısından otomatik çalıştırılmaz.
- `UPSTREAM_REVISIONS.txt`: iki kaynağın indirildiği commit kimlikleri.

**Henüz mevcut olmayanlar:** asistanların otomatik olarak yerel dosya değişikliklerini önizlemesi/uygulaması, gerçek zamanlı ortak kod düzenleme, Git entegrasyon arayüzü, Monaco Editor, kalıcı etkileşimli terminal, Windows üzerinde uçtan uca doğrulanmış birleşik uygulama. Bunlar tamamlanmış gibi gösterilmez.

## Çalıştırma (Windows)

Gereksinimler: Node.js 22.13+ (veya 24+), pnpm 11, Rust toolchain, Microsoft C++ Build Tools, WebView2. [Tauri Windows gereksinimleri](https://v2.tauri.app/start/prerequisites/).

```powershell
cd C:\Projeler\NetVera-AI-IDE
corepack enable
corepack prepare pnpm@11.0.0 --activate
pnpm install
pnpm build:injected
pnpm typecheck
pnpm tauri dev
```

Sol alttaki **NetVera Kod Alanı** düğmesinden proje klasörünü açın. Değişiklikleri kaydetmeden önce kullanıcı onayı gerekir. Terminal komutu da yalnızca kullanıcı düğmeye bastığında çalışır.

OpenBrowser bağımsız olarak incelenebilir:

```powershell
cd C:\Projeler\NetVera-AI-IDE\integrations\openbrowser
pnpm install
pnpm build
```

Bu, ilk kaynak birleştirme tabanıdır; otomatik AI köprüsü değildir.

## Uygulama güvenliği

OpenBrowser'ın üst kaynak kodu AI yanıtından `RUN_COMMAND` kabul edebilir. Bu mekanizmayı ana uygulamaya otomatik bağlamak güvenli sayılmaz. Terminal işlemleri ve dosya yazma önce diff inceleme, proje-yolu doğrulaması, açık kullanıcı onayı ve Git yedeğiyle çevrelenecektir.

Normal asistan web oturumlarının otomatik kullanımı sağlayıcıların kullanım koşullarından ve arayüz değişikliklerinden etkilenebilir. Kaynakları birleştirmek sınırsız veya resmen desteklenen erişim sağlamaz.

## Lisans ve atıf

Multi-AI Chat Desktop: Ted Huang, MIT, 2026. Orijinal `LICENSE` ve `NOTICE.md` mevcut.
OpenBrowser: 1129Aliasgar, MIT, 2026. Orijinal `integrations/openbrowser/LICENSE` mevcut.
Bkz. `UPSTREAM_SOURCES.md`.
