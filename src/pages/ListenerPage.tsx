import { useEffect, useRef, useState } from 'react';
import { fetchActiveBroadcast } from '../lib/radioData';
import { getNowPlaying } from '../lib/radioEngine';
import { audioUrl } from '../lib/supabase';
import type { Broadcast, Track } from '../lib/types';

export default function ListenerPage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [data, setData] = useState<{ broadcast: Broadcast; tracks: Track[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState('');
  const [volume, setVolume] = useState(0.8);
  const currentFile = useRef<string>('');

  useEffect(() => {
    fetchActiveBroadcast().then((d) => { setData(d); setLoaded(true); });
  }, []);

  // Sync the audio element to the wall clock.
  function syncToClock(forceReload = false) {
    if (!data || !audioRef.current) return;
    const np = getNowPlaying(data.broadcast, data.tracks, Date.now() / 1000);
    setTitle(np.title);
    const audio = audioRef.current;
    if (forceReload || currentFile.current !== np.filePath) {
      currentFile.current = np.filePath;
      audio.src = audioUrl(np.filePath);
      audio.load();
      audio.currentTime = np.offsetSeconds;
    } else if (Math.abs(audio.currentTime - np.offsetSeconds) > 3) {
      audio.currentTime = np.offsetSeconds;
    }
  }

  async function handlePlay() {
    if (!audioRef.current) return;
    syncToClock(true);
    try {
      await audioRef.current.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  function handleStop() {
    audioRef.current?.pause();
    setPlaying(false);
  }

  // When a track ends, recompute from the clock (advances playlist / loops single).
  function handleEnded() {
    syncToClock(true);
    audioRef.current?.play().catch(() => {});
  }

  // Periodic drift correction while playing.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => syncToClock(false), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, data]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  return (
    <div className="radio">
      <header className="radio-header">
        <span className="live"><span className="dot" /> Canlı Yayın</span>
      </header>

      {!loaded && <p className="status">Yükleniyor…</p>}
      {loaded && !data && <p className="status">Yayın yakında 🎧</p>}

      {loaded && data && (
        <main className="player">
          <div className="player-controls">
            <button
              className="play-btn"
              onClick={playing ? handleStop : handlePlay}
              aria-label={playing ? 'Durdur' : 'Çal'}
            >
              {playing ? '❚❚' : '►'}
            </button>
            <p className="now-label">Şimdi çalıyor</p>
            <p className="now-title">{title || data.broadcast.name}</p>
            <input
              className="volume"
              type="range" min={0} max={1} step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </div>
        </main>
      )}

      <footer className="radio-footer">FERMENTÉ BAKING CO. · 7/24</footer>

      <audio ref={audioRef} onEnded={handleEnded} preload="none" />
    </div>
  );
}
