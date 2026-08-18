alter table public.character_stats_snapshot
  add column if not exists weapon_code integer not null default 0;

alter table public.team_comp_stats
  add column if not exists character_weapon_keys text[] not null default '{}';

alter table public.character_stats_snapshot
  drop constraint if exists character_stats_snapshot_character_code_period_days_period_start_key;

alter table public.character_stats_snapshot
  drop constraint if exists character_stats_snapshot_character_code_period_days_period__key;

alter table public.character_stats_snapshot
  drop constraint if exists character_stats_snapshot_character_code_period_days_perio_key;

alter table public.character_stats_snapshot
  add constraint character_stats_snapshot_character_weapon_period_key
  unique (character_code, weapon_code, period_days, period_start);

create index if not exists character_stats_snapshot_weapon_idx
  on public.character_stats_snapshot(character_code, weapon_code);

create index if not exists team_comp_stats_character_weapon_keys_idx
  on public.team_comp_stats using gin(character_weapon_keys);
