create table if not exists public.ranker_collection_cursors (
  external_user_id text primary key,
  nickname text not null default '',
  mmr integer not null default 0,
  latest_game_id bigint,
  last_scanned_at timestamptz not null default now()
);

create table if not exists public.match_ingestion_queue (
  game_id bigint primary key,
  source_external_user_id text,
  source_nickname text not null default '',
  game_started_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  last_error text,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists match_ingestion_queue_work_idx
  on public.match_ingestion_queue(status, attempts, discovered_at);

create index if not exists ranker_collection_cursors_scanned_idx
  on public.ranker_collection_cursors(last_scanned_at);

alter table public.ranker_collection_cursors enable row level security;
alter table public.match_ingestion_queue enable row level security;
