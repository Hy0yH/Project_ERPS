create table if not exists public.characters (
  character_code integer primary key,
  name_ko text not null,
  name_en text,
  role text,
  weapon_types text[] default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  game_id bigint primary key,
  season_id integer,
  matching_mode integer,
  matching_team_mode integer,
  version_season integer,
  version_major integer,
  version_minor integer,
  server_name text,
  started_at timestamptz not null
);

create table if not exists public.match_players (
  game_id bigint not null references public.matches(game_id) on delete cascade,
  user_num bigint not null,
  nickname text not null,
  team_number integer not null,
  character_code integer references public.characters(character_code),
  game_rank integer not null,
  player_kill integer default 0,
  player_assistant integer default 0,
  mmr_before integer default 0,
  mmr_gain integer default 0,
  mmr_after integer default 0,
  best_weapon integer,
  equipment jsonb default '{}',
  created_at timestamptz not null default now(),
  primary key (game_id, user_num)
);

create index if not exists match_players_character_idx on public.match_players(character_code);
create index if not exists match_players_nickname_idx on public.match_players(lower(nickname));
create index if not exists match_players_mmr_idx on public.match_players(mmr_after);

create table if not exists public.character_stats_snapshot (
  id bigserial primary key,
  character_code integer not null references public.characters(character_code),
  period_days integer not null default 14,
  period_start timestamptz not null,
  period_end timestamptz not null,
  season_id integer,
  tier_filter text not null default 'mythril_plus',
  games integer not null,
  pick_rate numeric not null,
  win_rate numeric not null,
  top3_rate numeric not null,
  average_rank numeric not null,
  confidence_score numeric not null,
  created_at timestamptz not null default now(),
  unique (character_code, period_days, period_start)
);

create table if not exists public.team_comp_stats (
  id bigserial primary key,
  comp_key text not null,
  character_codes integer[] not null,
  comp_size integer not null check (comp_size in (2, 3)),
  period_days integer not null default 14,
  period_start timestamptz not null,
  period_end timestamptz not null,
  games integer not null,
  wins integer not null,
  top3 integer not null,
  win_rate numeric not null,
  top3_rate numeric not null,
  average_rank numeric not null,
  confidence_score numeric not null,
  created_at timestamptz not null default now(),
  unique (comp_key, period_days, period_start)
);

create index if not exists team_comp_stats_codes_idx on public.team_comp_stats using gin(character_codes);

create table if not exists public.patch_notes (
  patch_version text primary key,
  published_at timestamptz,
  source_url text not null,
  raw_text text not null,
  imported_at timestamptz not null default now()
);

create table if not exists public.character_patch_changes (
  id bigserial primary key,
  patch_version text not null references public.patch_notes(patch_version) on delete cascade,
  character_code integer not null default 0,
  change_type text not null check (change_type in ('buff', 'nerf', 'adjustment', 'bugfix', 'indirect')),
  target_type text,
  target_name text,
  before_value text,
  after_value text,
  raw_change_text text not null,
  impact_score numeric not null default 0,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists character_patch_changes_character_idx
  on public.character_patch_changes(character_code);

create table if not exists public.ingestion_runs (
  id bigserial primary key,
  job_name text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  saved_matches integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create or replace function public.player_summary(input_nickname text)
returns jsonb
language sql
stable
as $$
  with player_rows as (
    select *
    from public.match_players
    where lower(nickname) = lower(input_nickname)
  ),
  grouped as (
    select
      character_code,
      count(*)::int as games,
      count(*) filter (where game_rank = 1)::int as wins,
      count(*) filter (where game_rank <= 3)::int as top3,
      coalesce(count(*) filter (where game_rank = 1)::numeric / nullif(count(*), 0), 0) as win_rate,
      coalesce(count(*) filter (where game_rank <= 3)::numeric / nullif(count(*), 0), 0) as top3_rate,
      avg(game_rank)::numeric as average_rank
    from player_rows
    group by character_code
    order by games desc
    limit 8
  )
  select case
    when not exists (select 1 from player_rows) then null
    else jsonb_build_object(
      'user_num', (select user_num from player_rows limit 1),
      'nickname', input_nickname,
      'total_games', (select count(*) from player_rows),
      'favorite_characters', coalesce((select jsonb_agg(to_jsonb(grouped)) from grouped), '[]'::jsonb)
    )
  end;
$$;
