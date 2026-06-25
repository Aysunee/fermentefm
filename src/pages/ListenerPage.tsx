import { useEffect, useRef, useState } from 'react';
import { fetchActiveBroadcast } from '../lib/radioData';
import { getNowPlaying, getUpNext } from '../lib/radioEngine';
import { audioUrl } from '../lib/supabase';
import type { Broadcast, Track } from '../lib/types';

function signature(d: { broadcast: Broadcast; tracks: Track[] } | null): string {
  if (!d) return 'none';
  const t = d.tracks.map((x) => `${x.id}:${x.position}:${x.title}:${x.file_path}`).join('|');
  return `${d.broadcast.id}:${d.broadcast.name}:${d.broadcast.single_file_path}:${t}`;
}

function ordered(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => a.position - b.position);
}

export default function ListenerPage() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [data, setData] = useState<{ broadcast: Broadcast; tracks: Track[] } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState('');
  const [upNext, setUpNext] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);
  // Canlı senkron mu, yoksa dinleyici kendi sırasında mı (atladıktan sonra)?
  const [live, setLive] = useState(true);
  const localIndex = useRef(0);
  const currentFile = useRef<string>('');

  useEffect(() => {
    fetchActiveBroadcast().then((d) => { setData(d); setLoaded(true); });
  }, []);

  // Aktif yayın admin tarafından düzenlenirse, içerik değişmişse otomatik güncelle.
  useEffect(() => {
    const id = setInterval(async () => {
      const next = await fetchActiveBroadcast();
      if (!next) return; // geçici hata ya da yayın yok — mevcut sesi koru, kesme
      setData((prev) => (signature(prev) === signature(next) ? prev : next));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Sync the audio element to the wall clock (canlı mod).
  function syncToClock(forceReload = false) {
    if (!data || !audioRef.current) return;
    const np = getNowPlaying(data.broadcast, data.tracks, Date.now() / 1000);
    setTitle(np.title);
    setUpNext(getUpNext(data.broadcast, data.tracks, Date.now() / 1000));
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

  // Dinleyicinin kendi sırasında bir parçayı baştan çal (canlıdan kopar).
  function playLocalAt(index: number) {
    if (!data || !audioRef.current) return;
    const list = ordered(data.tracks);
    if (list.length === 0) return;
    const i = ((index % list.length) + list.length) % list.length;
    const track = list[i];
    const audio = audioRef.current;
    localIndex.current = i;
    currentFile.current = track.file_path;
    audio.src = audioUrl(track.file_path);
    audio.load();
    audio.currentTime = 0;
    setLive(false);
    setTitle(track.title);
    setUpNext(list.length > 1 ? list[(i + 1) % list.length].title : null);
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  async function handlePlay() {
    if (!audioRef.current) return;
    if (live) syncToClock(true);
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

  // Sıradaki parçaya geç: canlıdaysa o anki parçanın sonrasından, yerel modda
  // mevcut indeksin sonrasından — her durumda baştan çalar, dinleyici özgür.
  function handleNext() {
    if (!data) return;
    const list = ordered(data.tracks);
    if (list.length < 2) return;
    let base = localIndex.current;
    if (live) {
      const np = getNowPlaying(data.broadcast, data.tracks, Date.now() / 1000);
      base = list.findIndex((t) => t.file_path === np.filePath);
      if (base < 0) base = 0;
    }
    playLocalAt(base + 1);
  }

  // Canlı senkrona geri dön.
  function handleGoLive() {
    setLive(true);
    syncToClock(true);
    audioRef.current?.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  // Parça bitince: canlıda saatten devam et, yerel modda sıradakine geç.
  function handleEnded() {
    if (live) {
      syncToClock(true);
      audioRef.current?.play().catch(() => {});
    } else {
      playLocalAt(localIndex.current + 1);
    }
  }

  // Periodic drift correction — sadece canlı modda.
  useEffect(() => {
    if (!live || !playing) return;
    const id = setInterval(() => syncToClock(false), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, data, live]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Canlı modda parça bilgisini saatten göster (çalmaya başlamadan da).
  useEffect(() => {
    if (!data || !live) return;
    const np = getNowPlaying(data.broadcast, data.tracks, Date.now() / 1000);
    setTitle(np.title);
    setUpNext(getUpNext(data.broadcast, data.tracks, Date.now() / 1000));
  }, [data, live]);

  const canSkip = !!data && data.broadcast.type === 'playlist' && data.tracks.length > 1;

  return (
    <div className="radio">
      <header className="radio-header">
        <span className={`live${live ? '' : ' off'}`}>
          <span className="dot" /> {live ? 'Canlı Yayın' : 'Yayın dışı'}
        </span>
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
            {upNext && <p className="up-next">Sırada · {upNext}</p>}
            <input
              className="volume"
              type="range" min={0} max={1} step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
            {canSkip && (
              <div className="listener-actions">
                <button className="skip-btn" onClick={handleNext}>Sonraki ⏭</button>
                {!live && (
                  <button className="live-btn" onClick={handleGoLive}>Canlıya dön</button>
                )}
              </div>
            )}
          </div>
        </main>
      )}

      <footer className="radio-footer">FERMENTÉ BAKING CO. · 7/24</footer>

      <audio ref={audioRef} onEnded={handleEnded} preload="none" />
    </div>
  );
}
