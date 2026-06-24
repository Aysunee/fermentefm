# FermenteFM v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 24/7 "virtual radio" web app for the Fermente bakery: a public listener page that plays one fixed, clock-synced broadcast (a single long file OR an ordered playlist), plus an admin panel to upload audio, build broadcasts, and pick the active one.

**Architecture:** No streaming server. A pure function computes "what should be playing right now" from the wall clock (`epochSeconds mod totalDuration`); every listener lands on the same position. Data (broadcasts, tracks) lives in the existing FermenteApp Supabase project; audio files live in a public Supabase Storage bucket. Admin writes are gated by the existing `is_admin()` SQL function; the listener page reads public data only.

**Tech Stack:** Vite + React + TypeScript, react-router-dom, @supabase/supabase-js, vitest (engine tests), plain CSS. Deployed on Netlify. Supabase project `kgdxxsvmzvmadcqtcgem` (shared with FermenteApp).

---

## File Structure

- `index.html` — app entry
- `src/main.tsx` — React root + router
- `src/App.tsx` — routes: `/` (listener), `/admin` (admin)
- `src/lib/types.ts` — `Track`, `Broadcast` types
- `src/lib/radioEngine.ts` — pure sync logic (TESTED)
- `src/lib/radioEngine.test.ts` — vitest tests for the engine
- `src/lib/supabase.ts` — Supabase client (mirrors FermenteApp env vars)
- `src/lib/radioData.ts` — data layer: fetch active broadcast, upload audio, create broadcast, set active
- `src/lib/audioDuration.ts` — browser helper to read an audio file's duration
- `src/pages/ListenerPage.tsx` — public player UI
- `src/pages/AdminPage.tsx` — login + broadcast management UI
- `src/styles.css` — all styling
- `supabase/migrations/0001_fermentefm.sql` — tables, RLS, storage bucket
- `.env`, `.env.example` — Supabase + admin env vars
- `netlify.toml` — SPA redirect + build config

---

## Task 1: Scaffold the Vite + React + TS project

**Files:**
- Create: `package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `.gitignore` (exists)

- [ ] **Step 1: Scaffold with Vite**

Run from project root (the directory already has `docs/` and git — scaffold in place):
```bash
npm create vite@latest . -- --template react-ts
```
If prompted about a non-empty directory, choose "Ignore files and continue".

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install @supabase/supabase-js react-router-dom
npm install -D vitest
```

- [ ] **Step 3: Add the test script**

Modify `package.json` `scripts` to include:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Replace `src/App.tsx` with a router shell**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ListenerPage from './pages/ListenerPage';
import AdminPage from './pages/AdminPage';
import './styles.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ListenerPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Create placeholder pages so the app compiles**

Create `src/pages/ListenerPage.tsx`:
```tsx
export default function ListenerPage() {
  return <div>FermenteFM</div>;
}
```
Create `src/pages/AdminPage.tsx`:
```tsx
export default function AdminPage() {
  return <div>FermenteFM Admin</div>;
}
```
Create empty `src/styles.css` (will fill in Task 7).

- [ ] **Step 6: Verify it builds and runs**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite React TS app with listener/admin routes"
```

---

## Task 2: Define data types

**Files:**
- Create: `src/lib/types.ts`

- [ ] **Step 1: Write the types**

```ts
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add radio data types"
```

---

## Task 3: Build the sync engine (TDD)

The engine answers: "Given a broadcast and the current epoch time, what file plays and at what offset?" This is the testable core.

**Files:**
- Create: `src/lib/radioEngine.ts`
- Test: `src/lib/radioEngine.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/radioEngine.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `getNowPlaying is not a function` / module not found.

- [ ] **Step 3: Implement the engine**

`src/lib/radioEngine.ts`:
```ts
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
  // Unreachable because pos < total, but satisfies the type checker.
  const first = ordered[0];
  return { filePath: first.file_path, title: first.title, offsetSeconds: 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all engine tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/radioEngine.ts src/lib/radioEngine.test.ts
git commit -m "feat: add clock-synced radio engine with tests"
```

---

## Task 4: Database schema, RLS, and storage bucket

Applied to the shared FermenteApp Supabase project (`kgdxxsvmzvmadcqtcgem`). Reuses the existing `is_admin()` SECURITY DEFINER function for write access.

**Files:**
- Create: `supabase/migrations/0001_fermentefm.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/0001_fermentefm.sql`:
```sql
-- FermenteFM v1 schema

create table if not exists public.radio_broadcasts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('single', 'playlist')),
  is_active boolean not null default false,
  single_file_path text,
  single_duration_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists public.radio_tracks (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.radio_broadcasts(id) on delete cascade,
  file_path text not null,
  title text not null,
  duration_seconds integer not null,
  position integer not null,
  created_at timestamptz not null default now()
);

create index if not exists radio_tracks_broadcast_idx
  on public.radio_tracks (broadcast_id, position);

-- At most one active broadcast
create unique index if not exists radio_broadcasts_single_active
  on public.radio_broadcasts (is_active) where is_active = true;

alter table public.radio_broadcasts enable row level security;
alter table public.radio_tracks enable row level security;

-- Public can read broadcasts and tracks (listener page, no login)
create policy radio_broadcasts_public_read on public.radio_broadcasts
  for select using (true);
create policy radio_tracks_public_read on public.radio_tracks
  for select using (true);

-- Only admin can write (reuses existing is_admin())
create policy radio_broadcasts_admin_write on public.radio_broadcasts
  for all using (public.is_admin()) with check (public.is_admin());
create policy radio_tracks_admin_write on public.radio_tracks
  for all using (public.is_admin()) with check (public.is_admin());

-- Public storage bucket for audio files
insert into storage.buckets (id, name, public)
  values ('fermentefm', 'fermentefm', true)
  on conflict (id) do nothing;

-- Anyone can read audio (public bucket); only admin can upload/modify
create policy fermentefm_public_read on storage.objects
  for select using (bucket_id = 'fermentefm');
create policy fermentefm_admin_write on storage.objects
  for all using (bucket_id = 'fermentefm' and public.is_admin())
  with check (bucket_id = 'fermentefm' and public.is_admin());
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool against project `kgdxxsvmzvmadcqtcgem` (name: `fermentefm_v1`), using the SQL above. (Fallback: paste into Supabase Dashboard → SQL Editor and run.)

- [ ] **Step 3: Verify**

Use Supabase MCP `list_tables` (or Dashboard) and confirm `radio_broadcasts` and `radio_tracks` exist, and `list` storage buckets shows `fermentefm`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_fermentefm.sql
git commit -m "feat: add FermenteFM schema, RLS, and storage bucket"
```

---

## Task 5: Supabase client + env

**Files:**
- Create: `src/lib/supabase.ts`, `.env.example`
- Copy: `.env` from FermenteApp (same project credentials)

- [ ] **Step 1: Create `.env.example`**

```
VITE_SUPABASE_URL=https://kgdxxsvmzvmadcqtcgem.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
VITE_ADMIN_EMAIL=mert@fermente.com.tr
```

- [ ] **Step 2: Create the real `.env`**

Copy the working values from FermenteApp (same Supabase project):
```bash
cp /Users/mertaysune/Desktop/FermenteApp/.env ./.env
```
Confirm `.env` is git-ignored (it is, via `.gitignore`).

- [ ] **Step 3: Create the client**

`src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string;

if (!url || !key) {
  console.warn('[FermenteFM] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY tanımlı değil.');
}

export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder',
);

// Public URL for a file in the fermentefm bucket
export function audioUrl(filePath: string): string {
  return supabase.storage.from('fermentefm').getPublicUrl(filePath).data.publicUrl;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts .env.example
git commit -m "feat: add Supabase client and env config"
```

---

## Task 6: Data layer (fetch active, upload, create, set active)

**Files:**
- Create: `src/lib/audioDuration.ts`, `src/lib/radioData.ts`

- [ ] **Step 1: Audio duration helper**

`src/lib/audioDuration.ts`:
```ts
// Reads the duration (seconds) of an audio File in the browser.
export function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(audio.duration));
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Ses süresi okunamadı'));
    };
    audio.src = url;
  });
}
```

- [ ] **Step 2: Data layer**

`src/lib/radioData.ts`:
```ts
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audioDuration.ts src/lib/radioData.ts
git commit -m "feat: add radio data layer (fetch, upload, create, activate)"
```

---

## Task 7: Listener page (player)

**Files:**
- Modify: `src/pages/ListenerPage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Implement the player**

`src/pages/ListenerPage.tsx`:
```tsx
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
        <span className="logo">Fermente<strong>FM</strong></span>
        <span className="live"><span className="dot" /> Canlı</span>
      </header>

      {!loaded && <p className="status">Yükleniyor…</p>}
      {loaded && !data && <p className="status">Yayın yakında 🎧</p>}

      {loaded && data && (
        <main className="player">
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
        </main>
      )}

      <audio ref={audioRef} onEnded={handleEnded} preload="none" />
    </div>
  );
}
```

- [ ] **Step 2: Style it**

Append to `src/styles.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }

.radio {
  min-height: 100vh;
  background: linear-gradient(160deg, #2b1d12, #4a2f1c);
  color: #f6e9da;
  display: flex; flex-direction: column; align-items: center;
  padding: 24px;
}
.radio-header {
  width: 100%; max-width: 480px;
  display: flex; justify-content: space-between; align-items: center;
}
.logo { font-size: 22px; letter-spacing: 1px; }
.logo strong { color: #e0a45e; }
.live { display: flex; align-items: center; gap: 6px; font-size: 13px; opacity: .85; }
.live .dot {
  width: 9px; height: 9px; border-radius: 50%; background: #e2483d;
  animation: pulse 1.4s infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

.player {
  flex: 1; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 16px; text-align: center;
}
.play-btn {
  width: 120px; height: 120px; border-radius: 50%; border: none;
  font-size: 42px; color: #2b1d12; background: #e0a45e; cursor: pointer;
  box-shadow: 0 8px 30px rgba(0,0,0,.35); transition: transform .1s;
}
.play-btn:active { transform: scale(.96); }
.now-label { margin: 0; font-size: 13px; text-transform: uppercase; opacity: .7; }
.now-title { margin: 0; font-size: 20px; font-weight: 600; }
.volume { width: 220px; max-width: 80vw; accent-color: #e0a45e; }
.status { margin-top: 30vh; font-size: 18px; opacity: .8; }
```

- [ ] **Step 3: Manually verify**

Run: `npm run dev`. Open the local URL. With no active broadcast yet you should see "Yayın yakında". (Full playback is verified in Task 9 after seeding a broadcast.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/ListenerPage.tsx src/styles.css
git commit -m "feat: add listener radio player page"
```

---

## Task 8: Admin page (login + manage broadcasts)

**Files:**
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Implement the admin page**

`src/pages/AdminPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { supabase, ADMIN_EMAIL } from '../lib/supabase';
import {
  listBroadcasts, uploadAudio, createSingleBroadcast,
  createPlaylistBroadcast, setActiveBroadcast,
} from '../lib/radioData';
import { readAudioDuration } from '../lib/audioDuration';
import type { Broadcast } from '../lib/types';

export default function AdminPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Form state
  const [mode, setMode] = useState<'single' | 'playlist'>('single');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(data.session?.user?.email === ADMIN_EMAIL);
    });
  }, []);

  useEffect(() => { if (authed) refresh(); }, [authed]);

  async function refresh() {
    setBroadcasts(await listBroadcasts());
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setMsg('Giriş başarısız: ' + error.message); return; }
    if (data.user?.email !== ADMIN_EMAIL) {
      setMsg('Bu hesap admin değil.');
      await supabase.auth.signOut();
      return;
    }
    setAuthed(true);
  }

  async function logout() {
    await supabase.auth.signOut();
    setAuthed(false);
  }

  async function createBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!name || files.length === 0) { setMsg('İsim ve en az bir dosya gerekli.'); return; }
    setBusy(true); setMsg('Yükleniyor…');
    try {
      const uploaded = [];
      for (const f of files) {
        const duration = await readAudioDuration(f);
        const filePath = await uploadAudio(f);
        uploaded.push({ filePath, title: f.name.replace(/\.[^.]+$/, ''), duration });
      }
      if (mode === 'single') {
        await createSingleBroadcast(name, uploaded[0].filePath, uploaded[0].duration);
      } else {
        await createPlaylistBroadcast(name, uploaded);
      }
      setName(''); setFiles([]); setMsg('Yayın oluşturuldu ✓');
      await refresh();
    } catch (err) {
      setMsg('Hata: ' + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: string) {
    setBusy(true);
    try { await setActiveBroadcast(id); await refresh(); }
    catch (err) { setMsg('Hata: ' + (err as Error).message); }
    finally { setBusy(false); }
  }

  if (authed === null) return <div className="admin"><p>Yükleniyor…</p></div>;

  if (!authed) {
    return (
      <div className="admin">
        <h1>FermenteFM Yönetim</h1>
        <form className="card" onSubmit={login}>
          <input placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Şifre" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="submit">Giriş</button>
          {msg && <p className="msg">{msg}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="admin">
      <div className="admin-top">
        <h1>FermenteFM Yönetim</h1>
        <button onClick={logout}>Çıkış</button>
      </div>

      <form className="card" onSubmit={createBroadcast}>
        <h2>Yeni Yayın</h2>
        <input placeholder="Yayın adı" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="modes">
          <label><input type="radio" checked={mode === 'single'} onChange={() => setMode('single')} /> Tek dosya</label>
          <label><input type="radio" checked={mode === 'playlist'} onChange={() => setMode('playlist')} /> Liste</label>
        </div>
        <input
          type="file" accept="audio/*"
          multiple={mode === 'playlist'}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <button type="submit" disabled={busy}>Oluştur</button>
        {msg && <p className="msg">{msg}</p>}
      </form>

      <div className="card">
        <h2>Yayınlar</h2>
        {broadcasts.length === 0 && <p>Henüz yayın yok.</p>}
        <ul className="bc-list">
          {broadcasts.map((b) => (
            <li key={b.id}>
              <span>{b.name} <em>({b.type === 'single' ? 'tek dosya' : 'liste'})</em></span>
              {b.is_active
                ? <span className="active-tag">● Aktif</span>
                : <button onClick={() => activate(b.id)} disabled={busy}>Aktif yap</button>}
            </li>
          ))}
        </ul>
      </div>

      <div className="card disabled">
        <h2>Programlar <span className="soon">yakında</span></h2>
        <p>Belirli saatlerde çalan programlar v2'de eklenecek.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Style it**

Append to `src/styles.css`:
```css
.admin {
  max-width: 560px; margin: 0 auto; padding: 24px;
  font-family: system-ui, sans-serif; color: #2b1d12;
}
.admin h1 { font-size: 22px; }
.admin-top { display: flex; justify-content: space-between; align-items: center; }
.card {
  background: #fff; border: 1px solid #e7ddd0; border-radius: 12px;
  padding: 16px; margin-bottom: 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.card h2 { margin: 0 0 4px; font-size: 16px; }
.card input[type=text], .card input:not([type]), .card input[type=password] {
  padding: 8px; border: 1px solid #cbb9a3; border-radius: 8px;
}
.card button {
  padding: 8px 14px; border: none; border-radius: 8px;
  background: #e0a45e; color: #2b1d12; font-weight: 600; cursor: pointer;
}
.card button:disabled { opacity: .5; cursor: default; }
.modes { display: flex; gap: 16px; }
.bc-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.bc-list li { display: flex; justify-content: space-between; align-items: center; }
.active-tag { color: #1f8a4c; font-weight: 600; }
.msg { font-size: 13px; color: #8a5a1f; }
.card.disabled { opacity: .6; }
.soon { font-size: 12px; background: #eee; padding: 2px 6px; border-radius: 6px; }
```

- [ ] **Step 3: Manually verify login**

Run: `npm run dev`, open `/admin`. Log in with the admin credentials. The form and (empty) broadcast list should appear. A wrong account should be rejected.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminPage.tsx src/styles.css
git commit -m "feat: add admin panel for managing broadcasts"
```

---

## Task 9: End-to-end verification

**Files:** none (manual verification)

- [ ] **Step 1: Create a single-file broadcast**

In `/admin`, log in, pick "Tek dosya", give it a name, upload one audio file, "Oluştur". Then "Aktif yap".

- [ ] **Step 2: Verify the listener page plays**

Open `/` in a normal tab and an incognito tab. Press play in both. Confirm:
- Both show the broadcast name under "Şimdi çalıyor".
- Both are roughly at the same position (within a few seconds).
- Volume slider works; the play/stop button toggles.

- [ ] **Step 3: Verify playlist mode**

Create a "Liste" broadcast with 2–3 files, activate it. Confirm the listener advances from one track to the next and the title updates on track change.

- [ ] **Step 4: Verify the full test suite**

Run: `npm test`
Expected: PASS.

---

## Task 10: Deploy config (Netlify)

**Files:**
- Create: `netlify.toml`

- [ ] **Step 1: Add Netlify config**

`netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Note deploy steps**

In the Netlify dashboard for this site, set env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL` (same values as `.env`). Connect the repo `github.com/Aysunee/fermentefm`. (Actual deploy is a manual/dashboard step, confirmed with the user.)

- [ ] **Step 3: Commit and push**

```bash
git add netlify.toml
git commit -m "chore: add Netlify deploy config"
git push
```

---

## Self-Review Notes

- **Spec coverage:** virtual-radio sync (Task 3), single-file + playlist broadcast (Tasks 2,4,6), listener page with play/stop/volume/now-playing/live badge, no seek (Task 7), admin upload→create→activate (Task 8), shared Supabase + RLS via `is_admin()` + public bucket (Tasks 4,5), programs deferred but shown as "yakında" (Task 8), empty-state "Yayın yakında" (Task 7), mobile-friendly CSS (Task 7), Netlify deploy (Task 10). All covered.
- **Type consistency:** `getNowPlaying(broadcast, tracks, epochSeconds)` and the `NowPlaying`/`Broadcast`/`Track` shapes match across engine, data layer, and pages. `single_duration_seconds` used consistently.
- **No placeholders:** every code step contains complete code.
