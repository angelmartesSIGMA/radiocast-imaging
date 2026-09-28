-- ── Radiocast Imaging: schema v1 ─────────────────────────────────────────
create extension if not exists pgcrypto;

do $$ begin
  create type track_type   as enum ('voice', 'bed', 'fx');
  create type brief_status as enum ('new', 'in_progress', 'needs_info', 'delivered', 'cancelled');
exception when duplicate_object then null; end $$;

create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Studio sessions (the whole arrangement lives in `data`)
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text,                                   -- future auth user id
  name        text not null default 'Untitled session',
  data        jsonb not null default '{}'::jsonb,     -- {version, clips, lanes, mix, target, bpm, grid, loudTarget}
  duration_s  real not null default 0,
  target_s    real,
  clip_count  int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists sessions_updated_idx on sessions (updated_at desc) where deleted_at is null;
create index if not exists sessions_owner_idx   on sessions (owner_id);
drop trigger if exists sessions_updated on sessions;
create trigger sessions_updated before update on sessions for each row execute function set_updated_at();

-- User uploads and recorded takes (files in bucket `user-audio`)
create table if not exists assets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text,
  session_id  uuid references sessions(id) on delete set null,
  path        text not null unique,                   -- user-audio/<asset id>.<ext>
  name        text not null,
  kind        text not null default 'Upload',         -- 'Upload' | 'Mic'
  type        track_type not null default 'voice',
  duration_s  real,
  size_bytes  bigint,
  mime        text,
  waveform    text,                                   -- SVG path (viewBox 0 0 100 40)
  uploaded    boolean not null default false,         -- set true once the file is in storage
  created_at  timestamptz not null default now()
);
create index if not exists assets_session_idx on assets (session_id);

-- Admin-managed sample library (files in bucket `samples`)
create table if not exists samples (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  kind        text not null default 'FX',             -- Bed | Sweep | Hit | FX | Stinger | Voice
  type        track_type not null default 'fx',
  category    text,
  tags        text[] not null default '{}',
  bpm         int,
  duration_s  real,
  size_bytes  bigint,
  mime        text,
  path        text not null unique,                   -- samples/<id>.<ext>
  waveform    text,
  published   boolean not null default false,
  featured    boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists samples_pub_idx on samples (published, kind, sort);
drop trigger if exists samples_updated on samples;
create trigger samples_updated before update on samples for each row execute function set_updated_at();

-- Briefs sent to producers
create table if not exists briefs (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  owner_id         text,
  session_id       uuid references sessions(id) on delete set null,
  session_snapshot jsonb not null default '{}'::jsonb,
  mix_path         text,                              -- briefs/<id>/mix.wav
  station          text,
  contact_email    text not null,
  voice            text,
  deliverables     text[] not null default '{}',
  turnaround       text not null default 'standard',
  script           text,
  target_s         real,
  status           brief_status not null default 'new',
  admin_notes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  delivered_at     timestamptz
);
create index if not exists briefs_status_idx on briefs (status, created_at desc);
drop trigger if exists briefs_updated on briefs;
create trigger briefs_updated before update on briefs for each row execute function set_updated_at();

-- Status history + producer deliveries
create table if not exists brief_events (
  id         bigserial primary key,
  brief_id   uuid not null references briefs(id) on delete cascade,
  status     brief_status,
  note       text,
  created_at timestamptz not null default now()
);
create table if not exists brief_files (
  id          uuid primary key default gen_random_uuid(),
  brief_id    uuid not null references briefs(id) on delete cascade,
  path        text not null unique,                   -- briefs/<brief id>/deliveries/<file>
  name        text not null,
  size_bytes  bigint,
  mime        text,
  created_at  timestamptz not null default now()
);

-- Lock everything down: no anon/authenticated access. The app uses the service role only.
alter table sessions     enable row level security;
alter table assets       enable row level security;
alter table samples      enable row level security;
alter table briefs       enable row level security;
alter table brief_events enable row level security;
alter table brief_files  enable row level security;

-- Private storage buckets (100 MB per file, audio only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('user-audio', 'user-audio', false, 104857600, array['audio/*']),
  ('samples',    'samples',    false, 104857600, array['audio/*']),
  ('briefs',     'briefs',     false, 262144000, array['audio/*', 'application/zip', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- storage.objects already has RLS on; with no policies for these buckets only the service role can touch them.
