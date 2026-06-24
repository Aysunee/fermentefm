export type BroadcastType = 'single' | 'playlist';

export interface Track {
  id: string;
  broadcast_id: string;
  file_path: string;        // Storage path inside the bucket
  title: string;
  duration_seconds: number; // > 0
  position: number;         // 0-based order within the broadcast
}

export interface Broadcast {
  id: string;
  name: string;
  type: BroadcastType;
  is_active: boolean;
  single_file_path: string | null; // set when type === 'single'
  single_duration_seconds: number | null; // set when type === 'single'
}

// What the listener page needs to play right now.
export interface NowPlaying {
  filePath: string;       // bucket path of the file to play
  title: string;          // text shown under "Şimdi çalıyor"
  offsetSeconds: number;  // where in the file to start (seconds)
}
