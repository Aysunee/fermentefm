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
