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
