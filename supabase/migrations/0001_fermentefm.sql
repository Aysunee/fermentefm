-- FermenteFM v1 schema
-- Applied to shared FermenteApp Supabase project pfegttohdkkpujtjkehx ("fermentedb")

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
