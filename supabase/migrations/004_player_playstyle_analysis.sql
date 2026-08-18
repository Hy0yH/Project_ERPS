alter table public.match_players
  add column if not exists character_level integer not null default 0,
  add column if not exists player_deaths integer not null default 0,
  add column if not exists monster_kill integer not null default 0,
  add column if not exists best_weapon_level integer not null default 0,
  add column if not exists play_time integer not null default 0,
  add column if not exists team_kill integer not null default 0,
  add column if not exists damage_to_player integer not null default 0,
  add column if not exists damage_from_player integer not null default 0,
  add column if not exists damage_to_monster integer not null default 0,
  add column if not exists heal_amount integer not null default 0,
  add column if not exists team_recover integer not null default 0,
  add column if not exists protect_absorb integer not null default 0,
  add column if not exists cc_time_to_player numeric not null default 0,
  add column if not exists add_surveillance_camera integer not null default 0,
  add column if not exists add_telephoto_camera integer not null default 0,
  add column if not exists remove_surveillance_camera integer not null default 0,
  add column if not exists remove_telephoto_camera integer not null default 0,
  add column if not exists use_security_console integer not null default 0,
  add column if not exists use_hyper_loop integer not null default 0,
  add column if not exists total_gain_vf_credit integer not null default 0,
  add column if not exists total_spent_vf_credit integer not null default 0,
  add column if not exists route_id_of_start integer not null default 0,
  add column if not exists place_of_start integer not null default 0,
  add column if not exists analysis_data_version smallint not null default 0;

create index if not exists match_players_analysis_cohort_idx
  on public.match_players(mmr_after, character_code, best_weapon, analysis_data_version);

create table if not exists public.player_metric_benchmarks (
  id bigserial primary key,
  patch_key text not null,
  season_id integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  mmr_bucket integer not null,
  segment_key text not null,
  character_code integer,
  weapon_code integer,
  sample_games integer not null default 0,
  sample_players integer not null default 0,
  stats jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (patch_key, mmr_bucket, segment_key, period_start)
);

create index if not exists player_metric_benchmarks_lookup_idx
  on public.player_metric_benchmarks(patch_key, mmr_bucket, segment_key, period_end desc);

create table if not exists public.player_analysis_cache (
  cache_key text primary key,
  user_num bigint not null,
  nickname text not null,
  season_id integer not null,
  patch_key text not null,
  latest_game_id bigint,
  benchmark_period_end timestamptz,
  analysis_version smallint not null default 1,
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists player_analysis_cache_nickname_idx
  on public.player_analysis_cache(lower(nickname), season_id, patch_key, generated_at desc);

create index if not exists player_analysis_cache_expiry_idx
  on public.player_analysis_cache(expires_at);

alter table public.player_metric_benchmarks enable row level security;
alter table public.player_analysis_cache enable row level security;
