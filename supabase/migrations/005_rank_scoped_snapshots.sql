alter table public.character_stats_snapshot
  add column if not exists rank_scope text not null default 'above:mythril';

alter table public.team_comp_stats
  add column if not exists rank_scope text not null default 'above:mythril';

alter table public.character_stats_snapshot
  drop constraint if exists character_stats_snapshot_character_weapon_period_key;

alter table public.character_stats_snapshot
  add constraint character_stats_snapshot_character_weapon_period_rank_key
  unique (character_code, weapon_code, period_days, period_start, rank_scope);

alter table public.team_comp_stats
  drop constraint if exists team_comp_stats_comp_key_period_days_period_start_key;

alter table public.team_comp_stats
  add constraint team_comp_stats_comp_period_rank_key
  unique (comp_key, period_days, period_start, rank_scope);

create index if not exists character_stats_snapshot_rank_scope_idx
  on public.character_stats_snapshot(rank_scope, period_days, period_start);

create index if not exists team_comp_stats_rank_scope_idx
  on public.team_comp_stats(rank_scope, period_days, period_start);
