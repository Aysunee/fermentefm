import { supabase } from './supabase';
import type { Broadcast, Track } from './types';
import { renumber } from './trackOrder';

// Listener: fetch the active broadcast and its tracks (if playlist).
export async function fetchActiveBroadcast(): Promise<
  { broadcast: Broadcast; tracks: Track[] } | null
> {
  const { data: b } = await supabase
    .from('radio_broadcasts')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (!b) return null;

  let tracks: Track[] = [];
  if (b.type === 'playlist') {
    const { data } = await supabase
      .from('radio_tracks')
      .select('*')
      .eq('broadcast_id', b.id)
      .order('position', { ascending: true });
    tracks = data ?? [];
  }
  return { broadcast: b as Broadcast, tracks };
}

// Admin: list all broadcasts.
export async function listBroadcasts(): Promise<Broadcast[]> {
  const { data } = await supabase
    .from('radio_broadcasts')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as Broadcast[];
}

// Admin: upload an audio file to the bucket, return its storage path.
export async function uploadAudio(file: File): Promise<string> {
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const { error } = await supabase.storage.from('fermentefm').upload(path, file);
  if (error) throw error;
  return path;
}

// Admin: create a single-file broadcast.
export async function createSingleBroadcast(
  name: string, filePath: string, duration: number,
): Promise<void> {
  const { error } = await supabase.from('radio_broadcasts').insert({
    name, type: 'single', single_file_path: filePath,
    single_duration_seconds: duration, is_active: false,
  });
  if (error) throw error;
}

// Admin: create a playlist broadcast with ordered tracks.
export async function createPlaylistBroadcast(
  name: string,
  items: { filePath: string; title: string; duration: number }[],
): Promise<void> {
  const { data: b, error } = await supabase
    .from('radio_broadcasts')
    .insert({ name, type: 'playlist', is_active: false })
    .select('id')
    .single();
  if (error) throw error;
  const rows = items.map((it, i) => ({
    broadcast_id: b.id, file_path: it.filePath, title: it.title,
    duration_seconds: it.duration, position: i,
  }));
  const { error: tErr } = await supabase.from('radio_tracks').insert(rows);
  if (tErr) throw tErr;
}

// Admin: make one broadcast active (clears the others first).
export async function setActiveBroadcast(id: string): Promise<void> {
  const { error: clr } = await supabase
    .from('radio_broadcasts')
    .update({ is_active: false })
    .eq('is_active', true);
  if (clr) throw clr;
  const { error } = await supabase
    .from('radio_broadcasts')
    .update({ is_active: true })
    .eq('id', id);
  if (error) throw error;
}

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
