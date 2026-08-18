alter table public.match_players
  add column if not exists external_user_id text;

create index if not exists match_players_external_user_id_idx
  on public.match_players(external_user_id)
  where external_user_id is not null;
