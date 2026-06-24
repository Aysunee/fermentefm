import { describe, it, expect } from 'vitest';
import { getNowPlaying } from './radioEngine';
import type { Broadcast, Track } from './types';

const single: Broadcast = {
  id: 'b1', name: 'Mix', type: 'single', is_active: true,
  single_file_path: 'mix.mp3', single_duration_seconds: 100,
};

const playlist: Broadcast = {
  id: 'b2', name: 'List', type: 'playlist', is_active: true,
  single_file_path: null, single_duration_seconds: null,
};
const tracks: Track[] = [
  { id: 't1', broadcast_id: 'b2', file_path: 'a.mp3', title: 'A', duration_seconds: 30, position: 0 },
  { id: 't2', broadcast_id: 'b2', file_path: 'b.mp3', title: 'B', duration_seconds: 20, position: 1 },
  { id: 't3', broadcast_id: 'b2', file_path: 'c.mp3', title: 'C', duration_seconds: 50, position: 2 },
];

describe('getNowPlaying - single file', () => {
  it('returns offset = epoch mod duration', () => {
    expect(getNowPlaying(single, [], 250)).toEqual({
      filePath: 'mix.mp3', title: 'Mix', offsetSeconds: 50,
    });
  });
  it('wraps at the duration boundary to 0', () => {
    expect(getNowPlaying(single, [], 100).offsetSeconds).toBe(0);
  });
});

describe('getNowPlaying - playlist', () => {
  // total duration = 30 + 20 + 50 = 100
  it('picks the first track inside its window', () => {
    expect(getNowPlaying(playlist, tracks, 10)).toEqual({
      filePath: 'a.mp3', title: 'A', offsetSeconds: 10,
    });
  });
  it('picks the second track with correct offset', () => {
    // epoch 40 -> 40 - 30 = 10 into track B
    expect(getNowPlaying(playlist, tracks, 40)).toEqual({
      filePath: 'b.mp3', title: 'B', offsetSeconds: 10,
    });
  });
  it('picks the third track with correct offset', () => {
    // epoch 70 -> 70 - 50 = 20 into track C
    expect(getNowPlaying(playlist, tracks, 70)).toEqual({
      filePath: 'c.mp3', title: 'C', offsetSeconds: 20,
    });
  });
  it('wraps around after total duration', () => {
    // epoch 105 -> 105 mod 100 = 5 -> track A at 5
    expect(getNowPlaying(playlist, tracks, 105)).toEqual({
      filePath: 'a.mp3', title: 'A', offsetSeconds: 5,
    });
  });
  it('orders tracks by position, not array order', () => {
    const shuffled = [tracks[2], tracks[0], tracks[1]];
    expect(getNowPlaying(playlist, shuffled, 40)).toEqual({
      filePath: 'b.mp3', title: 'B', offsetSeconds: 10,
    });
  });
});
