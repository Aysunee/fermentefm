import { supabase } from './supabase';
import type { Broadcast, Track } from './types';

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
