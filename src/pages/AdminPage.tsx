import { useEffect, useState } from 'react';
import { supabase, ADMIN_EMAIL } from '../lib/supabase';
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
  renameBroadcast, deleteBroadcast,
  getTracks, renameTrack, deleteTrack, addTracks, reorderTracks,
} from '../lib/radioData';
import { readAudioDuration } from '../lib/audioDuration';
import type { Broadcast, Track } from '../lib/types';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Form state
  const [mode, setMode] = useState<'single' | 'playlist'>('single');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  // Editing panel state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTracks, setEditTracks] = useState<Track[]>([]);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(data.session?.user?.email === ADMIN_EMAIL);
    });
  }, []);

  useEffect(() => { if (authed) refresh(); }, [authed]);

  async function refresh() {
    setBroadcasts(await listBroadcasts());
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setMsg('Giriş başarısız: ' + error.message); return; }
    if (data.user?.email !== ADMIN_EMAIL) {
      setMsg('Bu hesap admin değil.');
      await supabase.auth.signOut();
      return;
    }
    setAuthed(true);
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthed(false);
  }

  async function createBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!name || files.length === 0) { setMsg('İsim ve en az bir dosya gerekli.'); return; }
    setBusy(true); setMsg('Yükleniyor…');
    try {
      const uploaded = [];
      for (const f of files) {
        const duration = await readAudioDuration(f);
        const filePath = await uploadAudio(f);
        uploaded.push({ filePath, title: f.name.replace(/\.[^.]+$/, ''), duration });
      }
      if (mode === 'single') {
        await createSingleBroadcast(name, uploaded[0].filePath, uploaded[0].duration);
      } else {
        await createPlaylistBroadcast(name, uploaded);
      }
      setName(''); setFiles([]); setMsg('Yayın oluşturuldu ✓');
      await refresh();
    } catch (err) {
      setMsg('Hata: ' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setBusy(true);
    try { await setActiveBroadcast(id); await refresh(); }
    catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }

  async function openEditor(b: Broadcast) {
    if (editingId === b.id) { setEditingId(null); return; }
    setEditingId(b.id);
    setEditName(b.name);
    setEditTracks(b.type === 'playlist' ? await getTracks(b.id) : []);
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

  if (authed === null) return <div className="admin"><p>Yükleniyor…</p></div>;

  if (!authed) {
    return (
      <div className="admin">
        <div className="admin-brand">
          <span className="admin-logo-box">
            <img className="admin-logo" src="/fermente-logo.jpeg" alt="Fermenté" />
          </span>
          <h1>FermenteFM Yönetim</h1>
        </div>
        <form className="card" onSubmit={login}>
          <input placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Şifre" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="submit">Giriş</button>
          {msg && <p className="msg">{msg}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <div className="admin-top">
        <div className="admin-brand">
          <span className="admin-logo-box">
            <img className="admin-logo" src="/fermente-logo.jpeg" alt="Fermenté" />
          </span>
          <h1>FermenteFM Yönetim</h1>
        </div>
        <button onClick={logout}>Çıkış</button>
      </div>

      <form className="card" onSubmit={createBroadcast}>
        <h2>Yeni Yayın</h2>
        <input placeholder="Yayın adı" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="modes">
          <label><input type="radio" checked={mode === 'single'} onChange={() => setMode('single')} /> Tek dosya</label>
          <label><input type="radio" checked={mode === 'playlist'} onChange={() => setMode('playlist')} /> Liste</label>
        </div>
        <input
          type="file" accept="audio/*"
          multiple={mode === 'playlist'}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <button type="submit" disabled={busy}>Oluştur</button>
        {msg && <p className="msg">{msg}</p>}
      </form>

      <div className="card">
        <h2>Yayınlar</h2>
        {broadcasts.length === 0 && <p>Henüz yayın yok.</p>}
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
                  {b.type === 'playlist' && (
                    <div className="track-mgr">
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
                      <label className="add-track">
                        Şarkı ekle
                        <input
                          type="file" accept="audio/*" multiple
                          onChange={(e) => addTracksToList(b.id, Array.from(e.target.files ?? []))}
                        />
                      </label>
                    </div>
                  )}
                  <button className="danger" onClick={() => removeBroadcast(b)} disabled={busy}>
                    Yayını sil
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="card disabled">
        <h2>Programlar <span className="soon">yakında</span></h2>
        <p>Belirli saatlerde çalan programlar v2'de eklenecek.</p>
      </div>
    </div>
  );
}
