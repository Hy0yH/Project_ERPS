create table if not exists public.player_character_profiles (
  external_user_id text not null,
  nickname text not null,
  season_id integer not null,
  scope text not null check (scope in ('season', 'current_patch')),
  patch_key text not null default '',
  character_code integer not null references public.characters(character_code),
  weapon_code integer not null default 0,
  games integer not null default 0,
  wins integer not null default 0,
  top3 integer not null default 0,
  win_rate numeric not null default 0,
  top3_rate numeric not null default 0,
  average_rank numeric not null default 0,
  average_kills numeric not null default 0,
  average_assists numeric not null default 0,
  average_damage_to_player numeric not null default 0,
  average_damage_from_player numeric not null default 0,
  average_basic_damage numeric not null default 0,
  average_skill_damage numeric not null default 0,
  average_heal_amount numeric not null default 0,
  average_team_recover numeric not null default 0,
  average_protect_absorb numeric not null default 0,
  average_view_contribution numeric not null default 0,
  average_vision_actions numeric not null default 0,
  average_survivable_time numeric not null default 0,
  average_cc_time_to_player numeric not null default 0,
  collected_at timestamptz not null default now(),
  primary key (external_user_id, season_id, scope, patch_key, character_code)
);

create index if not exists player_character_profiles_nickname_idx
  on public.player_character_profiles(lower(nickname), season_id, scope, collected_at desc);

create index if not exists player_character_profiles_character_idx
  on public.player_character_profiles(character_code, season_id, scope);

alter table public.player_character_profiles enable row level security;
