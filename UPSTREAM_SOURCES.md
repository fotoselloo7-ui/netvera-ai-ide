# Kaynak kodların kökeni

- Masaüstü / çoklu asistan koordinasyonu: https://github.com/TED-H-com/multi-ai-chat-desktop (MIT, Ted Huang, 2026). Kodlar NetVera deposunun **köküne** alınır. Orijinal `LICENSE` ve `NOTICE.md` korunur.
- Tarayıcı / yerel ajan altyapısı: https://github.com/1129Aliasgar/OpenBrowser (MIT, 1129Aliasgar, 2026). Kodlar `integrations/openbrowser/` altına alınır. Orijinal `integrations/openbrowser/LICENSE` korunur.
- `integrations/openbrowser` doğrudan masaüstü uygulamasının içine gömülü çalışan bir bileşen değildir. İlk değişiklikte NetVera'nın yerel çalışma alanı komutları ve paneli eklenir. Gerçek görev→dosya uygulama aktarımı ayrı bir entegrasyon olarak doğrulanacaktır.

`git rev-parse HEAD` ile alınan kaynak commitleri kurulum sırasında `UPSTREAM_REVISIONS.txt` dosyasına yazılır.

## Kullanım ve güvenlik

Üçüncü taraf normal sohbet arayüzlerini otomatik kullanmak sağlayıcıların koşulları ve güvenlik kısıtları kapsamındadır. Buradaki kodlar bu kısıtları kaldırmaz. Özellikle OpenBrowser `RUN_COMMAND` işlemini kontrolsüz AI çıktılarıyla başlatmayın. NetVera ilk sürümde terminal için açık kullanıcı onayı ister; internet kaynaklı promptlardan otomatik terminal çalıştırma yoktur.
