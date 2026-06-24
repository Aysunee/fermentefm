# FermenteFM — Tasarım Belgesi

**Tarih:** 2026-06-24
**Proje:** Fermente fırını için 7/24 internet radyosu
**Durum:** v1 kapsamı onaylandı (brainstorming)

## Amaç
Fermente fırınının web sitesinde kesintisiz çalan, "gerçek istasyon" hissi veren
bir internet radyosu. Dinleyici siteye girer, tek tıkla yayını dinler; herkes
yaklaşık aynı noktayı duyar (radyo gibi). Yönetim bir admin paneliyle yapılır.

## Temel Kararlar
- **Senkron modeli:** "Sanal radyo" — yayın sunucusu (Icecast/Liquidsoap) YOK.
  Tarayıcı, duvar saatine göre yayının hangi noktasında olunması gerektiğini
  hesaplar ve oradan başlatır. Maliyet ~sıfır.
- **İçerik (v1):** Tek, sabit, sürekli bir yayın. Kullanıcı bunu uzun süre
  değiştirmeyecek. İki tip desteklenir:
  - **Tek dosya yayını:** uzun bir mix/kayıt, 7/24 baştan sona döner (loop).
  - **Liste yayını:** sıralı şarkı listesi, sürekli döner.
- **Programlar (zamanlı kayıtlar):** v2'ye ertelendi. Panelde "yakında" olarak
  görünür, veri/altyapıda yeri bırakılır ama v1'de kodlanmaz.
- **Stack:** React + TypeScript + Vite + Supabase + Netlify (diğer Fermente
  projeleriyle aynı).
- **Altyapı:** Ekstra ücret olmasın diye mevcut FermenteApp Supabase projesi
  (`kgdxxsvmzvmadcqtcgem`) paylaşılır. Tablolar ve müzik dosyaları (Storage)
  oraya eklenir. Admin auth mevcut sistemi kullanır (`mert@fermente.com.tr`).

## Senkron Motoru (nasıl çalışır)
Aktif yayının toplam süresi `D` saniyedir (tek dosyada dosya süresi; listede
tüm parçaların toplamı). Geçerli konum:

```
konum = (epoch_saniye) mod D
```

- **Tek dosya:** `<audio>` öğesi yüklenir, `currentTime = konum` ile o saniyeye
  sarılır; bitince başa döner (loop).
- **Liste:** `konum` değeri parçalara göre taranır; hangi parçada olunduğu ve o
  parça içindeki saniye bulunur; o parça o saniyeden başlatılır, bitince sıradaki
  parça çalar; liste bitince başa döner.

Herkes aynı `epoch_saniye` + aynı `D` kullandığı için yaklaşık senkron olur
(ağ/tampon kaynaklı birkaç saniye sapma kabul edilebilir).

## Dinleyici Sayfası (public)
Tek, sade radyo sayfası — giriş gerektirmez:
- Ortada büyük **Play/Dur** düğmesi (tarayıcı otomatik oynatmaya izin vermediği
  için ilk seste tek tıklama zorunludur — beklenen davranış).
- **"Şimdi çalıyor"** metni: tek dosyada yayın adı, listede o anki şarkı adı.
- **Ses düzeyi (volume)** ayarı.
- Üstte **FermenteFM logosu**, fırın temasına uygun renkler.
- Küçük **"🔴 Canlı"** rozeti (radyo hissi).
- İleri/geri sarma **yok** (radyo mantığı).
- Mobil uyumlu.

## Admin Paneli (sadece admin)
Mevcut admin girişiyle erişilir. Akış: **dosya yükle → yayın yap → aktif et.**
- **Müzik yükleme:** yerel ses dosyası (mp3 vb.) Supabase Storage'a yüklenir.
- **Yayın oluşturma:**
  - *Tek dosya yayını:* bir dosya seç → yayın bu olsun.
  - *Liste yayını:* birkaç şarkı seç ve sıraya diz.
- **Aktif yayın seçimi:** hangi yayın canlıda olacak (tek tıkla). Aynı anda
  yalnızca bir aktif yayın olur.
- **Yayın adı:** "Şimdi çalıyor" altında görünecek isim.
- **Programlar bölümü:** "yakında" (v2), tıklanabilir değil.

## Veri Modeli (Supabase — mevcut proje)
- **Storage:** `fermentefm` adlı klasör/bucket içinde müzik dosyaları.
- **Tablo `radio_broadcasts`:**
  - `id`, `name`, `type` (`single` | `playlist`), `is_active` (boolean),
    `single_file_path` (tek dosya yayını için), `created_at`.
  - Yalnızca bir satır `is_active = true` olmalı.
- **Tablo `radio_tracks`:**
  - `id`, `broadcast_id` (FK), `file_path`, `title`, `duration_seconds`,
    `position` (sıra no), `created_at`.
- **RLS:** Dinleyiciler aktif yayını ve parçalarını **okuyabilir** (public
  read). Yazma/yükleme yalnızca admin.
- **Programlar tablosu:** v2'de eklenecek (`radio_programs`), şimdilik yok.

## Kenar Durumlar
- **Otomatik oynatma engeli:** İlk oynatma kullanıcı tıklamasıyla başlar.
- **Süre bilgisi:** Liste yayınında senkron için her parçanın `duration_seconds`
  değeri gerekir; yükleme/yayın oluşturma sırasında hesaplanıp kaydedilir.
- **Aktif yayın değişince:** Dinleyici sayfası yeni aktif yayını alır ve ona
  geçer (sayfa yenilemede veya periyodik kontrolde).
- **Boş durum:** Aktif yayın yoksa sayfa "Yayın yakında" mesajı gösterir.

## Kapsam Sınırı
- ✅ **v1:** sabit yayın (tek dosya veya liste), saate göre senkron oynatıcı,
  admin paneli (yükle/yayın yap/aktif et).
- ⏳ **v2:** zamanlı programlar (günlük/haftalık/tek-seferlik — tam esneklik).
- ❌ **Yok:** canlı mikrofon, dinleyici hesapları, sosyal özellikler, ileri/geri
  sarma.
