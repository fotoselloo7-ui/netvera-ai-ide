# NetVera AI IDE - Kurulu uygulamayi tek tikla guncelle

Bu mekanizma Windows'taki **kurulu** Tauri `.exe` uygulamasini gunceller. Bir Tauri
uygulamasi derlenmis kod icerir; `git pull` tek basina acik/kurulu `.exe` dosyasina
yeni özellikleri eklemez.

## Bir defalik kullanim

1. Yerel proje klasoru: `C:\Projeler\NetVera-AI-IDE`
2. Windows CMD'de:

   ```bat
   cd /d C:\Projeler\NetVera-AI-IDE
   git pull --ff-only origin main
   NETVERA-GUNCELLE.cmd
   ```

3. Guncelleyici ilk basarili calismasinda otomatik olarak masaustune
   **NetVera AI IDE - Guncelle** kisayolunu ekler.

Sonraki her guncellemede masaustundeki kisayola cift tiklaman yeterlidir.

## Nasıl calisir?

1. GitHub'dan yalnizca `main` dalini fast-forward ile gunceller.
2. `main` HEAD commit'ine **aynen uyan**, basarili Windows Actions derlemesini bulur.
3. `NetVera-AI-IDE-Windows-x64` artifact'indaki NSIS `.exe` kurulumunu indirir.
4. Acik IDE penceresini **zorlamadan** normal yoldan kapatir; kapanamiyorsa mevcut
   kuruluma dokunmadan hata verir.
5. Installer'i sessiz modda calistirir, cikis kodunu kontrol eder, kurulu IDE'yi acar.

Ayni commit zaten kuruluysa tekrar indirmez veya kurmaz, sadece uygulamayi acar.

## Gereksinimler ve guvenlik

- Windows; Git for Windows; `gh` (GitHub CLI) girisi: `gh auth login`.
- GitHub Actions artifact'larini okuyabilen GitHub hesabi.
- **Rust, Node, pnpm ve Visual Studio Build Tools zorunlu degildir.**
- Kurulum mevcut Windows kullanici/kurulum yetkisi baglaminda calisir. UAC gerekiyorsa
  Windows bunu sorar. Betik yonetici yetkisini gizlice yukseltemez.
- Genel PowerShell ExecutionPolicy ayarini degistirmez; `-ExecutionPolicy Bypass`
  yalnizca acikca baslatilan bu tek komut icin gecerli olur.
- Yerel Git degisikliklerini sifirlamaz, `git reset --hard` kullanmaz.
- GitHub Actions basarisizsa veya henüz bitmediyse **kurulu uygulamayi degistirmez**.
- Uygulama acikken kaydedilmemis metin olabilir; once kaydetmen onerilir.
- Installer henuz kod imzali bir yayin kanali degildir. Kaynagi kullaniciya ait
  GitHub CI uretimidir; surum / imza denetiminin yerini almaz.
- 14 gunluk Actions artifact saklama suresi nedeniyle sadece son basarili HEAD kullanilir;
  sure dolarsa ayni commit icin Windows workflow yeniden calistirilmalidir.

## Gelistirme modu farki

`IDE-BASLAT.cmd` Rust/Tauri gelistirme sunucusu ile `pnpm tauri dev` acar.
`NETVERA-GUNCELLE.cmd` ise **mevcut kurulu masaustu programini** en son dogrulanmis
Windows paketine yukseltir. Gunluk kullanim icin ikinci yontemi sec.
