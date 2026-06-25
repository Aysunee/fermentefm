import type { Broadcast, Track, NowPlaying } from './types';

export function getNowPlaying(
  broadcast: Broadcast,
  tracks: Track[],
  epochSeconds: number,
): NowPlaying {
  const now = Math.floor(epochSeconds);

  if (broadcast.type === 'single') {
    const duration = broadcast.single_duration_seconds ?? 0;
    const offset = duration > 0 ? now % duration : 0;
    return {
      filePath: broadcast.single_file_path ?? '',
      title: broadcast.name,
      offsetSeconds: offset,
    };
  }

  const ordered = [...tracks].sort((a, b) => a.position - b.position);
  const total = ordered.reduce((sum, t) => sum + t.duration_seconds, 0);
  if (total <= 0) {
    return { filePath: '', title: broadcast.name, offsetSeconds: 0 };
  }

  let pos = now % total;
  for (const track of ordered) {
    if (pos < track.duration_seconds) {
      return { filePath: track.file_path, title: track.title, offsetSeconds: pos };
    }
    pos -= track.duration_seconds;
  }
  const first = ordered[0];
  return { filePath: first.file_path, title: first.title, offsetSeconds: 0 };
}

// Title of the track that plays after the current one, or null when there is
// nothing meaningful to show (single-file loop, empty or single-track playlist).
export function getUpNext(
  broadcast: Broadcast,
  tracks: Track[],
  epochSeconds: number,
): string | null {
  if (broadcast.type === 'single') return null;

  const ordered = [...tracks].sort((a, b) => a.position - b.position);
  if (ordered.length < 2) return null;
  const total = ordered.reduce((sum, t) => sum + t.duration_seconds, 0);
  if (total <= 0) return null;

  let pos = Math.floor(epochSeconds) % total;
  for (let i = 0; i < ordered.length; i++) {
    if (pos < ordered[i].duration_seconds) {
      return ordered[(i + 1) % ordered.length].title;
    }
    pos -= ordered[i].duration_seconds;
  }
  return ordered[0].title;
}
