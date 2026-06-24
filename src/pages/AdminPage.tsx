import { useEffect, useState } from 'react';
import { supabase, ADMIN_EMAIL } from '../lib/supabase';
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
  renameBroadcast, deleteBroadcast,
  getTracks, renameTrack, deleteTrack, addTracks,
} from '../lib/radioData';
import { readAudioDuration } from '../lib/audioDuration';
import type { Broadcast, Track } from '../lib/types';

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
