import type { Track } from './types';

// Diziyi mevcut sırasına göre 0..n-1 position'larına eşler.
// Sadece position'ı değişen satırları döner ({ id, position }).
export function renumber(tracks: Track[]): { id: string; position: number }[] {
  return tracks
    .map((track, index) => ({ id: track.id, position: index }))
    .filter((row, index) => tracks[index].position !== row.position);
}
