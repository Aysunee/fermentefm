# Müzik Yönetim Ekranı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin panelinden var olan yayın ve şarkıları yönetmek — silme, yeniden adlandırma, listeye ekleme/çıkarma, sürükle-bırak sıralama, tek dosyayı değiştirme — ve dinleyicinin değişiklikleri otomatik görmesi.

**Architecture:** Saf sıralama mantığı `src/lib/trackOrder.ts`'e ayrılır (testli). Supabase okuma/yazma işlemleri `src/lib/radioData.ts`'e eklenir. Düzenleme UI'si `src/pages/AdminPage.tsx`'te satır içi açılan panelde toplanır; sürükle-bırak `@dnd-kit` ile yapılır. `src/pages/ListenerPage.tsx` aktif yayını 30 sn'de bir yoklayıp içerik değişmişse günceller.

**Tech Stack:** React 19, TypeScript, Vite, Supabase JS, vitest, @dnd-kit/core, @dnd-kit/sortable.

**Referans spec:** `docs/superpowers/specs/2026-06-24-music-management-design.md`

**Not — ortam:** Node/npm `/opt/homebrew/bin` altında. Her komuttan önce:
`export PATH=/opt/homebrew/bin:$PATH` (veya tek satırda komutla birlikte).

---

### Task 1: Sürükle-bırak bağımlılıklarını ekle

**Files:**
- Modify: `package.json` (npm install otomatik günceller)

- [ ] **Step 1: Bağımlılıkları kur**

```bash
cd /Users/mertaysune/Desktop/fermentefm
export PATH=/opt/homebrew/bin:$PATH
npm install @dnd-kit/core@^6 @dnd-kit/sortable@^8 @dnd-kit/utilities@^3
```

Expected: `package.json` `dependencies` altına üç paket eklenir, `package-lock.json` güncellenir.

- [ ] **Step 2: Kurulumu doğrula**

```bash
export PATH=/opt/homebrew/bin:$PATH && npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: Üç paket de sürüm numarasıyla listelenir, hata yok.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit for drag-and-drop track ordering"
```

---

### Task 2: trackOrder.ts — saf sıralama mantığı (TDD)

**Files:**
- Create: `src/lib/trackOrder.ts`
- Test: `src/lib/trackOrder.test.ts`

Not: Sürükle-bırakta yeniden sıralamayı dnd-kit'in `arrayMove`'u yapacak, bu yüzden
burada yalnızca veritabanına yazılacak `position` farklarını hesaplayan `renumber` var.

- [ ] **Step 1: Başarısız testi yaz**

`src/lib/trackOrder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renumber } from './trackOrder';
import type { Track } from './types';

const t = (id: string, position: number): Track => ({
  id, broadcast_id: 'b', file_path: `${id}.mp3`, title: id,
  duration_seconds: 10, position,
});

describe('renumber', () => {
  it('returns only rows whose position changed', () => {
    // Dizi sırası: t3(eski2), t1(eski0), t2(eski1)
    const tracks = [t('t3', 2), t('t1', 0), t('t2', 1)];
    expect(renumber(tracks)).toEqual([
      { id: 't3', position: 0 },
      { id: 't1', position: 1 },
      { id: 't2', position: 2 },
    ]);
  });

  it('returns empty array when already in order', () => {
    const tracks = [t('a', 0), t('b', 1), t('c', 2)];
    expect(renumber(tracks)).toEqual([]);
  });

  it('handles a gap after deletion (1,2 -> 0,1)', () => {
    const tracks = [t('b', 1), t('c', 2)];
    expect(renumber(tracks)).toEqual([
      { id: 'b', position: 0 },
      { id: 'c', position: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu doğrula**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm test -- trackOrder`
Expected: FAIL — "Cannot find module './trackOrder'" / "renumber is not a function".

- [ ] **Step 3: Minimal implementasyonu yaz**

`src/lib/trackOrder.ts`:

```ts
import type { Track } from './types';

// Diziyi mevcut sırasına göre 0..n-1 position'larına eşler.
// Sadece position'ı değişen satırları döner ({ id, position }).
export function renumber(tracks: Track[]): { id: string; position: number }[] {
  return tracks
    .map((track, index) => ({ id: track.id, position: index }))
    .filter((row, index) => tracks[index].position !== row.position);
}
```

- [ ] **Step 4: Testin geçtiğini doğrula**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm test -- trackOrder`
Expected: PASS — 3 test geçer.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trackOrder.ts src/lib/trackOrder.test.ts
git commit -m "feat: add pure track renumber helper"
```

---

### Task 3: radioData.ts — yönetim fonksiyonları

**Files:**
- Modify: `src/lib/radioData.ts` (mevcut fonksiyonlar korunur, dosya sonuna eklenir)

- [ ] **Step 1: Import satırını güncelle**

`src/lib/radioData.ts` dosyasının en üstündeki import bloğuna `renumber` ekle.
Mevcut:

```ts
import { supabase } from './supabase';
import type { Broadcast, Track } from './types';
```

Yeni hali:

```ts
import { supabase } from './supabase';
import type { Broadcast, Track } from './types';
import { renumber } from './trackOrder';
```

- [ ] **Step 2: Yönetim fonksiyonlarını dosyanın SONUNA ekle**

`src/lib/radioData.ts` dosyasının sonuna ekle:

```ts
// ---- Admin: management ----

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

// Storage'dan dosyaları sil (boş yollar atlanır).
async function removeFiles(paths: string[]): Promise<void> {
  const clean = paths.filter(Boolean);
  if (clean.length === 0) return;
  await supabase.storage.from('fermentefm').remove(clean);
}

// renumber() çıktısını veritabanına uygula.
async function applyOrder(rows: { id: string; position: number }[]): Promise<void> {
  for (const row of rows) {
    const { error } = await supabase
      .from('radio_tracks').update({ position: row.position }).eq('id', row.id);
    if (error) throw error;
  }
}

// Yayını ve tüm ses dosyalarını kalıcı sil.
export async function deleteBroadcast(b: Broadcast): Promise<void> {
  let paths: string[] = [];
  if (b.type === 'single' && b.single_file_path) {
    paths = [b.single_file_path];
  } else {
    const tracks = await getTracks(b.id);
    paths = tracks.map((track) => track.file_path);
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
  const remaining = await getTracks(track.broadcast_id);
  await applyOrder(renumber(remaining));
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

- [ ] **Step 3: Tip kontrolü ve build**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm run build`
Expected: PASS — TypeScript hatası yok, build başarılı.

- [ ] **Step 4: Commit**

```bash
git add src/lib/radioData.ts
git commit -m "feat: add admin data functions for managing broadcasts and tracks"
```

---

### Task 4: AdminPage — düzenleme paneli iskeleti (ad değiştir + yayın sil)

**Files:**
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Import ve state ekle**

Not: `noUnusedLocals` açık olduğu için her task'ın build'i geçsin diye import'ları
sadece kullanıldıkları task'ta ekliyoruz. Burada yalnızca Task 4'te kullanılanlar.

`src/pages/AdminPage.tsx` üst import bloğunu güncelle. Mevcut:

```ts
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
} from '../lib/radioData';
```

Yeni hali (yalnızca bu task'ta kullanılan `renameBroadcast`, `deleteBroadcast` eklenir;
`getTracks` ve `Track` tipi Task 5'te eklenecek):

```ts
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
  renameBroadcast, deleteBroadcast,
} from '../lib/radioData';
```

`AdminPage` bileşeninin içindeki form state'lerinin altına (mevcut `const [files, setFiles] = useState<File[]>([]);` satırından sonra) ekle:

```ts
  // Editing panel state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
```

- [ ] **Step 2: Panel açma/kapama ve ad kaydetme fonksiyonlarını ekle**

`activate` fonksiyonundan sonra ekle (şarkı yükleme Task 5'te eklenecek, burada sadece
ad + panel açma):

```ts
  function openEditor(b: Broadcast) {
    if (editingId === b.id) { setEditingId(null); return; }
    setEditingId(b.id);
    setEditName(b.name);
  }

  async function saveName(b: Broadcast) {
    setBusy(true);
    try { await renameBroadcast(b.id, editName); await refresh(); setMsg('Ad güncellendi ✓'); }
    catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }

  async function removeBroadcast(b: Broadcast) {
    if (!window.confirm(`"${b.name}" yayını ve tüm şarkıları kalıcı silinecek. Emin misin?`)) return;
    setBusy(true);
    try { await deleteBroadcast(b); setEditingId(null); await refresh(); setMsg('Yayın silindi ✓'); }
    catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }
```

- [ ] **Step 3: Yayın listesini panel açacak şekilde güncelle**

`AdminPage.tsx`'teki yayın listesi `<ul className="bc-list">` bloğunu BUL ve şu hale getir:

```tsx
        <ul className="bc-list">
          {broadcasts.map((b) => (
            <li key={b.id} className="bc-item">
              <div className="bc-row">
                <span>{b.name} <em>({b.type === 'single' ? 'tek dosya' : 'liste'})</em></span>
                <div className="bc-actions">
                  {b.is_active
                    ? <span className="active-tag">● Aktif</span>
                    : <button onClick={() => activate(b.id)} disabled={busy}>Aktif yap</button>}
                  <button onClick={() => openEditor(b)} disabled={busy}>
                    {editingId === b.id ? 'Kapat' : 'Düzenle'}
                  </button>
                </div>
              </div>

              {editingId === b.id && (
                <div className="bc-editor">
                  <div className="edit-name">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <button onClick={() => saveName(b)} disabled={busy}>Kaydet</button>
                  </div>
                  <button className="danger" onClick={() => removeBroadcast(b)} disabled={busy}>
                    Yayını sil
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
```

- [ ] **Step 4: Panel stillerini ekle**

`src/styles.css` dosyasının sonuna ekle:

```css
/* ---- Admin: editing panel ---- */
.bc-item { flex-direction: column; align-items: stretch; }
.bc-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.bc-actions { display: flex; gap: 8px; align-items: center; }
.bc-editor {
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px 0 4px; margin-top: 10px; border-top: 1px solid #ececec;
}
.edit-name { display: flex; gap: 8px; }
.edit-name input { flex: 1; padding: 8px; border: 1px solid #c8c8c8; }
.bc-editor button.danger {
  align-self: flex-start; background: #c8392b; border-color: #c8392b; color: #fff;
}
.bc-editor button.danger:hover { background: #fff; color: #c8392b; }
```

- [ ] **Step 5: Build + manuel doğrula**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm run build`
Expected: PASS — build başarılı.
Manuel: Admin'de bir yayında "Düzenle" → panel açılır, ad input'u dolu gelir, "Kaydet" adı değiştirir, "Yayını sil" onay sorar ve siler.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminPage.tsx src/styles.css
git commit -m "feat: add admin editing panel with rename and delete broadcast"
```

---

### Task 5: AdminPage — playlist şarkı yönetimi (liste, ad değiştir, sil, ekle)

**Files:**
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Import, Track tipi, editTracks state ve openEditor güncellemesi**

a) `src/pages/AdminPage.tsx`'teki `../lib/radioData` import bloğunu genişlet. Mevcut:

```ts
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
  renameBroadcast, deleteBroadcast,
} from '../lib/radioData';
```

Yeni hali:

```ts
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
  renameBroadcast, deleteBroadcast,
  getTracks, renameTrack, deleteTrack, addTracks,
} from '../lib/radioData';
```

b) `Track` tipini types import'una ekle. Mevcut:

```ts
import type { Broadcast } from '../lib/types';
```

Yeni hali:

```ts
import type { Broadcast, Track } from '../lib/types';
```

c) `editName` state'inin altına `editTracks` state'ini ekle:

```ts
  const [editTracks, setEditTracks] = useState<Track[]>([]);
```

d) `openEditor`'ı şarkıları da yükleyecek şekilde değiştir. Mevcut:

```ts
  function openEditor(b: Broadcast) {
    if (editingId === b.id) { setEditingId(null); return; }
    setEditingId(b.id);
    setEditName(b.name);
  }
```

Yeni hali:

```ts
  async function openEditor(b: Broadcast) {
    if (editingId === b.id) { setEditingId(null); return; }
    setEditingId(b.id);
    setEditName(b.name);
    setEditTracks(b.type === 'playlist' ? await getTracks(b.id) : []);
  }
```

- [ ] **Step 2: Şarkı işlem fonksiyonlarını ekle**

`removeBroadcast` fonksiyonundan sonra ekle:

```ts
  async function reloadTracks(broadcastId: string) {
    setEditTracks(await getTracks(broadcastId));
  }

  async function saveTrackTitle(track: Track, title: string) {
    setBusy(true);
    try { await renameTrack(track.id, title); await reloadTracks(track.broadcast_id); }
    catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }

  async function removeTrack(track: Track) {
    if (!window.confirm(`"${track.title}" şarkısı kalıcı silinecek. Emin misin?`)) return;
    setBusy(true);
    try { await deleteTrack(track); await reloadTracks(track.broadcast_id); setMsg('Şarkı silindi ✓'); }
    catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }

  async function addTracksToList(broadcastId: string, newFiles: File[]) {
    if (newFiles.length === 0) return;
    setBusy(true); setMsg('Yükleniyor…');
    try {
      const items = [];
      for (const f of newFiles) {
        const duration = await readAudioDuration(f);
        const filePath = await uploadAudio(f);
        items.push({ filePath, title: f.name.replace(/\.[^.]+$/, ''), duration });
      }
      await addTracks(broadcastId, items);
      await reloadTracks(broadcastId);
      setMsg('Şarkı(lar) eklendi ✓');
    } catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }
```

- [ ] **Step 3: Şarkı listesi UI'sini panele ekle**

`.bc-editor` içinde, `danger` butonundan ÖNCE (yani `<button className="danger" ...>` satırının hemen üstüne) ekle:

```tsx
                  {b.type === 'playlist' && (
                    <div className="track-mgr">
                      <ul className="track-list">
                        {editTracks.map((t) => (
                          <li key={t.id} className="track-row">
                            <span className="drag-handle">≡</span>
                            <input
                              className="track-title"
                              defaultValue={t.title}
                              onBlur={(e) => {
                                if (e.target.value !== t.title) saveTrackTitle(t, e.target.value);
                              }}
                            />
                            <button className="track-del" onClick={() => removeTrack(t)} disabled={busy}>×</button>
                          </li>
                        ))}
                      </ul>
                      <label className="add-track">
                        Şarkı ekle
                        <input
                          type="file" accept="audio/*" multiple
                          onChange={(e) => addTracksToList(b.id, Array.from(e.target.files ?? []))}
                        />
                      </label>
                    </div>
                  )}
```

- [ ] **Step 4: Şarkı yönetimi stillerini ekle**

`src/styles.css` sonuna ekle:

```css
/* ---- Admin: track manager ---- */
.track-mgr { display: flex; flex-direction: column; gap: 10px; }
.track-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.track-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border: 1px solid #ececec; background: #fff;
}
.drag-handle { cursor: grab; color: #8a8a8a; user-select: none; font-size: 16px; }
.track-title { flex: 1; padding: 6px; border: 1px solid #d8d8d8; font-size: 13px; }
.track-del {
  background: #fff; color: #c8392b; border: 1px solid #c8392b;
  width: 28px; height: 28px; padding: 0; font-size: 16px; line-height: 1; cursor: pointer;
}
.track-del:hover { background: #c8392b; color: #fff; }
.add-track {
  font-size: 12px; letter-spacing: 1px; text-transform: uppercase;
  display: flex; flex-direction: column; gap: 6px;
}
```

- [ ] **Step 5: Build + manuel doğrula**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm run build`
Expected: PASS.
Manuel: Liste tipi yayında "Düzenle" → şarkılar listelenir; başlığı değiştirip başka yere tıkla → kaydeder; × ile sil → onay sorup siler; "Şarkı ekle" ile yeni dosya seç → listeye eklenir.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminPage.tsx src/styles.css
git commit -m "feat: manage playlist tracks (rename, delete, add) in admin panel"
```

---

### Task 6: AdminPage — sürükle-bırak sıralama (@dnd-kit)

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: dnd-kit ve reorderTracks import'larını ekle**

Önce `../lib/radioData` import bloğuna `reorderTracks` ekle. Mevcut:

```ts
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
  renameBroadcast, deleteBroadcast,
  getTracks, renameTrack, deleteTrack, addTracks,
} from '../lib/radioData';
```

Yeni hali:

```ts
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
  renameBroadcast, deleteBroadcast,
  getTracks, renameTrack, deleteTrack, addTracks, reorderTracks,
} from '../lib/radioData';
```

Sonra `src/pages/AdminPage.tsx` import bloğunun sonuna dnd-kit import'larını ekle:

```ts
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

- [ ] **Step 2: Sürüklenebilir şarkı satırı bileşenini ekle**

`AdminPage.tsx` dosyasında, `export default function AdminPage()` satırının ÜSTÜNE ekle:

```tsx
function SortableTrack({
  track, busy, onRename, onDelete,
}: {
  track: Track;
  busy: boolean;
  onRename: (t: Track, title: string) => void;
  onDelete: (t: Track) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: track.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className="track-row">
      <span className="drag-handle" {...attributes} {...listeners}>≡</span>
      <input
        className="track-title"
        defaultValue={track.title}
        onBlur={(e) => { if (e.target.value !== track.title) onRename(track, e.target.value); }}
      />
      <button className="track-del" onClick={() => onDelete(track)} disabled={busy}>×</button>
    </li>
  );
}
```

- [ ] **Step 3: Sürükleme sensörlerini ve onDragEnd'i bileşene ekle**

`AdminPage` bileşeninin içinde, `editName` state'inden sonra ekle:

```ts
  const sensors = useSensors(useSensor(PointerSensor), useSensor(TouchSensor));

  async function onDragEnd(event: DragEndEvent, broadcastId: string) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = editTracks.findIndex((t) => t.id === active.id);
    const newIndex = editTracks.findIndex((t) => t.id === over.id);
    const next = arrayMove(editTracks, oldIndex, newIndex);
    setEditTracks(next); // anında ekranda göster
    setBusy(true);
    try { await reorderTracks(next); }
    catch (err) { setMsg('Hata: ' + (err as Error).message); await reloadTracks(broadcastId); }
    finally { setBusy(false); }
  }
```

- [ ] **Step 4: Şarkı listesini DndContext ile sar**

Task 5'te eklenen `<ul className="track-list">...</ul>` bloğunu BUL ve şununla değiştir:

```tsx
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => onDragEnd(e, b.id)}
                      >
                        <SortableContext
                          items={editTracks.map((t) => t.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ul className="track-list">
                            {editTracks.map((t) => (
                              <SortableTrack
                                key={t.id}
                                track={t}
                                busy={busy}
                                onRename={saveTrackTitle}
                                onDelete={removeTrack}
                              />
                            ))}
                          </ul>
                        </SortableContext>
                      </DndContext>
```

- [ ] **Step 5: Build + manuel doğrula**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm run build`
Expected: PASS.
Manuel: Liste yayınında ≡ tutamağından bir şarkıyı tutup sürükle, bırak → sıra değişir ve kalıcı kaydedilir (sayfayı yenileyince yeni sıra korunur). Parmakla (mobil/dokunmatik) da çalışır.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat: drag-and-drop track reordering with @dnd-kit"
```

---

### Task 7: AdminPage — tek dosyalı yayında sesi değiştir

**Files:**
- Modify: `src/pages/AdminPage.tsx`

- [ ] **Step 1: replaceSingleFile import'unu ekle**

`../lib/radioData` import bloğuna `replaceSingleFile` ekle. Mevcut son satır:

```ts
  getTracks, renameTrack, deleteTrack, addTracks, reorderTracks,
} from '../lib/radioData';
```

Yeni hali:

```ts
  getTracks, renameTrack, deleteTrack, addTracks, reorderTracks, replaceSingleFile,
} from '../lib/radioData';
```

- [ ] **Step 2: Dosya değiştirme fonksiyonunu ekle**

`addTracksToList` fonksiyonundan sonra ekle:

```ts
  async function replaceFile(b: Broadcast, newFile: File | undefined) {
    if (!newFile) return;
    setBusy(true); setMsg('Yükleniyor…');
    try {
      const duration = await readAudioDuration(newFile);
      const filePath = await uploadAudio(newFile);
      await replaceSingleFile(b, filePath, duration);
      await refresh();
      setMsg('Dosya değiştirildi ✓');
    } catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }
```

- [ ] **Step 3: Tek dosya UI'sini panele ekle**

`.bc-editor` içinde, playlist bloğunun (`{b.type === 'playlist' && (...)}`) hemen ALTINA ekle:

```tsx
                  {b.type === 'single' && (
                    <label className="add-track">
                      Dosyayı değiştir
                      <input
                        type="file" accept="audio/*"
                        onChange={(e) => replaceFile(b, e.target.files?.[0])}
                      />
                    </label>
                  )}
```

- [ ] **Step 4: Build + manuel doğrula**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm run build`
Expected: PASS.
Manuel: Tek dosya tipi yayında "Düzenle" → "Dosyayı değiştir" ile yeni MP3 seç → eski dosya gider, yeni dosya kaydedilir, "Dosya değiştirildi ✓" mesajı görünür.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AdminPage.tsx
git commit -m "feat: replace audio file for single-file broadcasts"
```

---

### Task 8: ListenerPage — aktif yayını 30 sn'de bir tazele

**Files:**
- Modify: `src/pages/ListenerPage.tsx`

- [ ] **Step 1: İmza yardımcı fonksiyonunu ekle**

`src/pages/ListenerPage.tsx` dosyasında, `export default function ListenerPage()` satırının ÜSTÜNE ekle:

```tsx
function signature(d: { broadcast: Broadcast; tracks: Track[] } | null): string {
  if (!d) return 'none';
  const t = d.tracks.map((x) => `${x.id}:${x.position}:${x.title}:${x.file_path}`).join('|');
  return `${d.broadcast.id}:${d.broadcast.name}:${d.broadcast.single_file_path}:${t}`;
}
```

- [ ] **Step 2: Periyodik tazeleme effect'i ekle**

`fetchActiveBroadcast().then(...)` içeren ilk `useEffect`'ten SONRA ekle:

```tsx
  // Aktif yayın admin tarafından düzenlenirse, içerik değişmişse otomatik güncelle.
  useEffect(() => {
    const id = setInterval(async () => {
      const next = await fetchActiveBroadcast();
      setData((prev) => (signature(prev) === signature(next) ? prev : next));
    }, 30000);
    return () => clearInterval(id);
  }, []);
```

- [ ] **Step 3: Build + manuel doğrula**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm run build`
Expected: PASS.
Manuel: İki sekme aç — birinde dinleyici sayfası, diğerinde admin. Admin'de aktif liste yayınına şarkı ekle/sil. En geç ~30 sn içinde dinleyici sekmesinde "Şimdi çalıyor" başlığı/içerik güncellenir (sayfa yenilenmeden). İçerik değişmediğinde ses kesintisiz devam eder.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ListenerPage.tsx
git commit -m "feat: listener auto-refreshes active broadcast every 30s"
```

---

## Son adım

Tüm task'lar bitince:

```bash
export PATH=/opt/homebrew/bin:$PATH && npm test && npm run build
git push origin build-v1
```

Expected: Tüm testler geçer, build başarılı, dal push edilir.
