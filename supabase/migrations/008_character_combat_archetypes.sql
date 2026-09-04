alter table public.characters
  add column if not exists official_archetype_primary text,
  add column if not exists official_archetype_secondary text,
  add column if not exists official_range_type text;

create table if not exists public.character_weapon_archetypes (
  character_code integer not null references public.characters(character_code) on delete cascade,
  weapon_code integer not null,
  range_profile text not null
    check (range_profile in ('melee', 'ranged', 'hybrid', 'unknown')),
  primary_function text not null
    check (primary_function in ('sustained_damage', 'burst_damage', 'engage', 'control', 'support', 'unknown')),
  secondary_function text,
  score_profile text not null
    check (score_profile in ('melee_damage', 'melee_engage', 'ranged_sustained', 'ranged_poke', 'utility_control', 'hybrid_skirmisher', 'unclassified')),
  review_status text not null default 'auto'
    check (review_status in ('auto', 'review_required', 'reviewed')),
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),
  classification_source text not null default 'official_api_v2',
  classification_version integer not null default 1,
  review_reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (character_code, weapon_code)
);

create index if not exists character_weapon_archetypes_profile_idx
  on public.character_weapon_archetypes(score_profile, review_status);

alter table public.character_weapon_archetypes enable row level security;

