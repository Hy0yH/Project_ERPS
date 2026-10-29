-- Existing snapshots remain readable; NULL means detail statistics were not built.
alter table public.character_stats_snapshot add column if not exists build_stats jsonb;
alter table public.match_players add column if not exists build_data_version integer not null default 0;

create table if not exists public.game_data_catalog (
  patch_key text not null,
  meta_type text not null,
  code integer not null,
  name_ko text not null,
  source_hash text not null,
  payload jsonb not null,
  collected_at timestamptz not null default now(),
  primary key (patch_key, meta_type, code)
);

create table if not exists public.weapon_route_cache (
  patch_key text not null,
  route_id bigint not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (patch_key, route_id)
);

-- Publish a table hash only after every catalog batch has been written.
create table if not exists public.game_catalog_versions (
  patch_key text not null,
  meta_type text not null,
  source_hash text not null,
  row_count integer not null,
  collected_at timestamptz not null default now(),
  primary key (patch_key, meta_type)
);

create table if not exists public.build_patch_changes (
  id bigserial primary key,
  patch_version text not null references public.patch_notes(patch_version) on delete cascade,
  entity_type text not null check (entity_type in ('item', 'trait', 'tactical_skill')),
  target_code integer,
  target_name text not null,
  raw_change_text text not null,
  change_hash text generated always as (md5(raw_change_text)) stored,
  before_value text,
  after_value text,
  change_type text not null check (change_type in ('buff', 'nerf', 'adjustment', 'bugfix')),
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (patch_version, entity_type, target_name, change_hash)
);
create index if not exists build_patch_changes_target_idx on public.build_patch_changes(entity_type, target_code);

-- These tables are accessed only by trusted server jobs using the service role.
alter table public.game_data_catalog enable row level security;
alter table public.weapon_route_cache enable row level security;
alter table public.game_catalog_versions enable row level security;
alter table public.build_patch_changes enable row level security;
