# FermenteFM — Müzik Yönetim Ekranı (Tasarım)

**Tarih:** 2026-06-24
**Durum:** Onay bekliyor

## Amaç

Admin panelinden var olan yayınların ve şarkıların **site içinden** yönetilebilmesi:
yayın/şarkı silme, isim değiştirme, listeye şarkı ekleme/çıkarma, sürükle-bırak ile
sıralama ve tek dosyalı yayında ses dosyasını değiştirme. Şu an admin yalnızca yeni
yayın oluşturup birini aktif yapabiliyor; düzenleme/silme yok.

## Alınan Kararlar

- **Kapsam:** Tam yönetim (silme + isim değiştir + sırala + ekle/çıkar + tek dosyayı değiştir).
- **Canlı düzenleme:** Aktif yayın canlıdayken de serbestçe düzenlenebilir; ekstra
  "emin misin" kilidi yok. Dinleyici tarafı değişikliği otomatik yansıtır.
- **Sıralama:** Sürükle-bırak, dokunma (mobil) destekli.
- **Silme:** Hem veritabanı kaydı hem Supabase storage dosyası kalıcı silinir.
- **Yerleşim:** Yayın listesinde satır içinde açılan panel (ayrı sayfa yok).
- **Maliyet/güvenlik:** Sadece `radio_*` tablolar ve `fermentefm` bucket kullanılır;
  mevcut fırın sistemine dokunulmaz. Tüm yazma işlemleri `is_admin()` RLS ile korunur.

## Mimari

Üç dosya değişir/eklenir; veritabanı şeması değişmez.

### 1. `src/lib/trackOrder.ts` (yeni, saf mantık — test edilir)

Sürükle-bırak ve silme sonrası sıra numaralarını yeniden hesaplayan saf fonksiyonlar.
Supabase'e bağımlı değildir, bu yüzden birim testi yazılır.

```ts
import type { Track } from './types';

// Diziyi mevcut sırasına göre 0..n-1 position'larına eşler.
// Döner: veritabanı update'i için { id, position } listesi (sadece değişenler).
export function renumber(tracks: Track[]): { id: string; position: number }[] {
  return tracks
    .map((t, i) => ({ id: t.id, position: i }))
    .filter((row, i) => tracks[i].position !== row.position);
}

// fromIndex'teki öğeyi toIndex'e taşıyıp yeni diziyi döner (mutasyon yok).
export function move<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
```

### 2. `src/lib/radioData.ts` (yeni fonksiyonlar eklenir)

Mevcut fonksiyonlar korunur. Eklenenler:

```ts
// Belirli bir yayının şarkılarını sıralı getir.
export async function getTracks(broadcastId: string): Promise<Track[]> {
  const { data } = await supabase
    .from('radio_tracks')
    .select('*')
    .eq('broadcast_id', broadcastId)
    .order('position', { ascending: true });
  return (data ?? []) as Track[];
}

// Yayın adını değiştir.
export async function renameBroadcast(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('radio_broadcasts').update({ name }).eq('id', id);
  if (error) throw error;
}

// Şarkı başlığını değiştir.
export async function renameTrack(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('radio_tracks').update({ title }).eq('id', id);
  if (error) throw error;
}

// Storage'dan dosyaları sil ("not found" hatası yok sayılır).
async function removeFiles(paths: string[]): Promise<void> {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  await supabase.storage.from('fermentefm').remove(clean);
}

// Yayını ve tüm dosyalarını kalıcı sil.
export async function deleteBroadcast(b: Broadcast): Promise<void> {
  let paths: string[] = [];
  if (b.type === 'single' && b.single_file_path) {
    paths = [b.single_file_path];
  } else {
    const tracks = await getTracks(b.id);
    paths = tracks.map((t) => t.file_path);
  }
  await removeFiles(paths);
  // radio_tracks satırları "on delete cascade" ile otomatik silinir.
  const { error } = await supabase.from('radio_broadcasts').delete().eq('id', b.id);
  if (error) throw error;
}

// Tek şarkıyı sil ve kalan şarkıları yeniden sırala.
export async function deleteTrack(track: Track): Promise<void> {
  await removeFiles([track.file_path]);
  const { error } = await supabase.from('radio_tracks').delete().eq('id', track.id);
  if (error) throw error;
  // Kalanları yeniden numarala.
  const remaining = await getTracks(track.broadcast_id);
  await applyOrder(renumber(remaining));
}

// renumber() çıktısını veritabanına uygula.
async function applyOrder(rows: { id: string; position: number }[]): Promise<void> {
  for (const r of rows) {
    const { error } = await supabase
      .from('radio_tracks').update({ position: r.position }).eq('id', r.id);
    if (error) throw error;
  }
}

// Sürükle-bırak sonrası yeni sırayı kaydet (orderedTracks: ekrandaki güncel sıra).
export async function reorderTracks(orderedTracks: Track[]): Promise<void> {
  await applyOrder(renumber(orderedTracks));
}

// Var olan listeye yeni şarkılar ekle (mevcut sonun arkasına).
export async function addTracks(
  broadcastId: string,
  items: { filePath: string; title: string; duration: number }[],
): Promise<void> {
  const existing = await getTracks(broadcastId);
  const start = existing.length;
  const rows = items.map((it, i) => ({
    broadcast_id: broadcastId, file_path: it.filePath, title: it.title,
    duration_seconds: it.duration, position: start + i,
  }));
  const { error } = await supabase.from('radio_tracks').insert(rows);
  if (error) throw error;
}

// Tek dosyalı yayının sesini değiştir (eski dosya silinir).
export async function replaceSingleFile(
  b: Broadcast, filePath: string, duration: number,
): Promise<void> {
  if (b.single_file_path) await removeFiles([b.single_file_path]);
  const { error } = await supabase.from('radio_broadcasts')
    .update({ single_file_path: filePath, single_duration_seconds: duration })
    .eq('id', b.id);
  if (error) throw error;
}
```

`uploadAudio` ve `readAudioDuration` (mevcut) yeni dosya yüklemek için yeniden kullanılır.

### 3. `src/pages/AdminPage.tsx` (panel eklenir)

Mevcut yayın listesi öğesine "Düzenle" butonu eklenir. Açık olan yayının `id`'si
state'te tutulur (`editingId`). Açıldığında o yayının şarkıları yüklenir.

Panel içeriği:

- **Ad düzenleme:** input + "Kaydet" → `renameBroadcast`.
- **Yayını sil:** kırmızı buton, `window.confirm` onayı → `deleteBroadcast` → listeyi yenile.
- **Liste tipi yayın:**
  - Sürüklenebilir şarkı satırları: tutamaç (≡), başlık (tıkla-düzenle → `renameTrack`),
    sil (×) → `deleteTrack`.
  - Sürükle-bırak ile sıralama → bırakınca `reorderTracks`.
  - "Şarkı ekle" çoklu dosya girişi → her dosya için `readAudioDuration` + `uploadAudio`,
    sonra `addTracks`.
- **Tek dosya tipi yayın:**
  - "Dosyayı değiştir" tek dosya girişi → `readAudioDuration` + `uploadAudio` +
    `replaceSingleFile`.

**Sürükle-bırak kütüphanesi:** `@dnd-kit/core` + `@dnd-kit/sortable` (ücretsiz npm
paketi, servis maliyeti yok). `PointerSensor`/`TouchSensor` ile masaüstü + mobil
dokunma desteği. `SortableContext` içinde şarkı satırları; `onDragEnd`'de `move()` ile
yerel state güncellenir, ardından `reorderTracks` ile veritabanına yazılır.

### 4. `src/pages/ListenerPage.tsx` (canlı tazeleme eklenir)

Aktif yayın düzenlenince dinleyici otomatik görsün diye, sayfa açıkken ~30 sn'de bir
`fetchActiveBroadcast()` tekrar çağrılır. Gelen veri mevcut `data` ile karşılaştırılır;
**içerik değişmişse** state güncellenir, değişmemişse hiçbir şey yapılmaz (ses kesilmez).

Karşılaştırma sade bir imza ile yapılır:

```ts
function signature(d: { broadcast: Broadcast; tracks: Track[] } | null): string {
  if (!d) return 'none';
  const t = d.tracks.map((x) => `${x.id}:${x.position}:${x.title}:${x.file_path}`).join('|');
  return `${d.broadcast.id}:${d.broadcast.name}:${d.broadcast.single_file_path}:${t}`;
}
```

İmza değişmişse `setData(next)`; bir sonraki `syncToClock` zaten yeni içeriğe göre
doğru şarkıyı/zamanı hesaplar. (Gerçek "anında" yansıma Supabase Realtime ile olur;
30 sn'lik yoklama (polling) maliyetsiz ve yeterli sade çözümdür.)

## Veri Akışı

1. Admin "Düzenle" → `getTracks` ile şarkılar yüklenir, panel açılır.
2. Admin bir işlem yapar (sil/ekle/sırala/yeniden adlandır) → ilgili `radioData`
   fonksiyonu çağrılır → panel verisi yenilenir.
3. Dinleyici sayfası 30 sn'de bir aktif yayını çeker → imza değişmişse günceller →
   `getNowPlaying` yeni içerikten doğru parçayı hesaplar.

## Hata Yönetimi

- Tüm işlemler `try/catch` ile sarılır; hata mevcut `msg` alanında Türkçe gösterilir.
- Storage silme `not found` durumunda sessiz geçer (dosya zaten yok); diğer hatalar yükselir.
- Silme işlemleri `window.confirm` ile onaylanır (geri alınamaz).

## Test

- `src/lib/trackOrder.test.ts`: `renumber` (değişen/değişmeyen sıralar) ve `move`
  (öğe taşıma, sınır indeksler) için birim testleri (vitest).
- Supabase çağrıları içeren `radioData` fonksiyonları, mevcut kodla tutarlı olarak
  birim test edilmez (entegrasyon manuel doğrulanır).

## Kapsam Dışı (YAGNI)

- Şarkıların farklı yayınlar arası taşınması.
- Geri al / çöp kutusu (silme kalıcıdır).
- Supabase Realtime ile gerçek zamanlı senkron (30 sn yoklama yeterli).
- Yükleme boyutu limiti ayarı (ayrı, isteğe bağlı konu).
