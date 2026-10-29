-- Apply after 009. Stop older collector processes before deploying the new writer.
-- No historical match is inferred to be complete from a participant count.
alter table public.matches
  add column detail_collected_at timestamptz,
  add column detail_player_count integer not null default 0,
  add column detail_analysis_version integer not null default 0,
  add column detail_build_version integer not null default 0;

alter table public.match_ingestion_queue
  drop constraint match_ingestion_queue_status_check,
  add constraint match_ingestion_queue_status_check
    check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  add column next_retry_at timestamptz not null default now();
alter table public.match_ingestion_queue add column claimed_run_id bigint references public.ingestion_runs(id);
create index match_ingestion_queue_claimed_run_idx on public.match_ingestion_queue(claimed_run_id)
  where claimed_run_id is not null;
create index match_ingestion_queue_retry_idx
  on public.match_ingestion_queue(next_retry_at, discovered_at)
  where status in ('pending', 'failed');

alter table public.ingestion_runs
  drop constraint ingestion_runs_status_check,
  add constraint ingestion_runs_status_check
    check (status in ('running', 'success', 'partial_success', 'failed', 'interrupted')),
  add column heartbeat_at timestamptz,
  add column lease_token uuid,
  add column stage text not null default 'starting';
update public.ingestion_runs set heartbeat_at = coalesce(finished_at, started_at);
alter table public.ingestion_runs alter column heartbeat_at set default now();
alter table public.ingestion_runs alter column heartbeat_at set not null;
create index ingestion_runs_active_idx on public.ingestion_runs(job_name, heartbeat_at)
  where status = 'running';

create table public.snapshot_staging_batches (
  run_id bigint not null references public.ingestion_runs(id) on delete cascade,
  table_name text not null check (table_name in ('character_stats_snapshot', 'team_comp_stats', 'player_metric_benchmarks')),
  batch_index integer not null check (batch_index >= 0),
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  primary key (run_id, table_name, batch_index)
);
alter table public.snapshot_staging_batches enable row level security;

create or replace function public.begin_ingestion_run(p_job_name text, p_lease_token uuid)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_id bigint;
begin
  if p_job_name not in ('collect-rankers', 'build-snapshots') or p_lease_token is null then
    raise exception 'Invalid job' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('erps:' || p_job_name));
  perform 1 from public.ingestion_runs where job_name = p_job_name and status = 'running' for update;
  if exists (select 1 from public.ingestion_runs where job_name = p_job_name and status = 'running'
    and heartbeat_at > now() - interval '10 minutes') then
    raise exception 'Job already running' using errcode = '55P03';
  end if;
  update public.ingestion_runs set status = 'interrupted', finished_at = now(),
    error_message = '{"stage":"lease","code":"LEASE_EXPIRED"}'
    where job_name = p_job_name and status = 'running';
  update public.match_ingestion_queue q set status = 'pending', next_retry_at = now(),
    claimed_run_id = null, updated_at = now(), last_error = 'WORKER_INTERRUPTED'
    from public.ingestion_runs r where q.claimed_run_id = r.id and q.status = 'processing'
      and r.job_name = p_job_name and r.status = 'interrupted';
  delete from public.snapshot_staging_batches s using public.ingestion_runs r
    where s.run_id = r.id and r.status <> 'running';
  insert into public.ingestion_runs(job_name, status, lease_token)
    values(p_job_name, 'running', p_lease_token) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.heartbeat_ingestion_run(
  p_run_id bigint, p_lease_token uuid, p_stage text, p_saved_matches integer
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.ingestion_runs set heartbeat_at = now(), stage = left(p_stage, 80), saved_matches = p_saved_matches
    where id = p_run_id and lease_token = p_lease_token and status = 'running'
      and heartbeat_at > now() - interval '10 minutes';
  return found;
end;
$$;

create or replace function public.finish_ingestion_run(
  p_run_id bigint, p_lease_token uuid, p_status text, p_saved_matches integer, p_diagnostic jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_status not in ('success', 'partial_success', 'failed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.ingestion_runs set status = p_status, finished_at = now(), heartbeat_at = now(),
    saved_matches = p_saved_matches, error_message = p_diagnostic::text
    where id = p_run_id and lease_token = p_lease_token and status = 'running'
      and heartbeat_at > now() - interval '10 minutes';
  return found;
end;
$$;

create or replace function public.save_ingested_game(p_match jsonb, p_players jsonb, p_complete boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_game_id bigint := (p_match->>'game_id')::bigint;
  v_player jsonb;
  v_existing public.matches;
begin
  if v_game_id is null or v_game_id <= 0 or jsonb_typeof(p_players) is distinct from 'array'
    or jsonb_array_length(p_players) = 0 or p_complete is null
    or (p_complete and jsonb_array_length(p_players) < 8) then
    raise exception 'Invalid game detail' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_players) p
    where (p->>'game_id')::bigint is distinct from v_game_id or coalesce((p->>'user_num')::bigint, 0) <= 0)
    or (select count(distinct p->>'user_num') from jsonb_array_elements(p_players) p) <> jsonb_array_length(p_players)
    or exists (select 1 from jsonb_array_elements(p_players) p where nullif(p->>'external_user_id', '') is not null
      group by p->>'external_user_id' having count(*) > 1) then
    raise exception 'Mismatched or duplicate players' using errcode = '22023';
  end if;
  insert into public.matches(game_id, season_id, matching_mode, matching_team_mode,
    version_season, version_major, version_minor, server_name, started_at)
    select game_id, season_id, matching_mode, matching_team_mode,
      version_season, version_major, version_minor, server_name, started_at
      from jsonb_populate_record(null::public.matches, p_match)
    on conflict (game_id) do nothing;
  select * into v_existing from public.matches where game_id = v_game_id for update;
  -- A personal history row must never downgrade an already verified full response.
  if not p_complete and v_existing.detail_collected_at is not null then return; end if;
  update public.matches set
    season_id = (p_match->>'season_id')::integer,
    matching_mode = (p_match->>'matching_mode')::integer,
    matching_team_mode = (p_match->>'matching_team_mode')::integer,
    version_season = (p_match->>'version_season')::integer,
    version_major = (p_match->>'version_major')::integer,
    version_minor = (p_match->>'version_minor')::integer,
    server_name = p_match->>'server_name', started_at = (p_match->>'started_at')::timestamptz
    where game_id = v_game_id;
  if p_complete then delete from public.match_players where game_id = v_game_id; end if;
  for v_player in select value from jsonb_array_elements(p_players) loop
    -- Reconcile an earlier partial row with the same verified identity within this game.
    delete from public.match_players p where p.game_id = v_game_id and (
      p.user_num = (v_player->>'user_num')::bigint or
      (nullif(v_player->>'external_user_id', '') is not null and p.external_user_id = v_player->>'external_user_id') or
      (lower(p.nickname) = lower(v_player->>'nickname') and
        (p.external_user_id is null or nullif(v_player->>'external_user_id', '') is null))
    );
    insert into public.match_players
      select (jsonb_populate_record(null::public.match_players,
        jsonb_build_object('created_at', now()) || v_player)).*;
  end loop;
  if p_complete then
    update public.matches set detail_collected_at = now(), detail_player_count = jsonb_array_length(p_players),
      detail_analysis_version = (select min((p->>'analysis_data_version')::integer) from jsonb_array_elements(p_players) p),
      detail_build_version = (select min((p->>'build_data_version')::integer) from jsonb_array_elements(p_players) p)
      where game_id = v_game_id;
  end if;
end;
$$;

-- All three live tables change in one transaction. Any batch error rolls back publication.
create or replace function public.publish_snapshot_build(
  p_run_id bigint, p_lease_token uuid, p_period_days integer, p_period_start timestamptz,
  p_period_end timestamptz, p_patch_key text, p_expected_counts jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_table text;
  v_rows jsonb;
  v_columns text;
  v_count bigint;
  v_batch record;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('erps:snapshot-publish'));
  perform 1 from public.ingestion_runs where id = p_run_id and lease_token = p_lease_token
    and job_name = 'build-snapshots' and status = 'running' and heartbeat_at > now() - interval '10 minutes' for update;
  if not found then raise exception 'Snapshot lease lost' using errcode = '55P03'; end if;
  if p_period_days is null or p_period_days not in (7,14,30) or p_period_start is null
    or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Invalid snapshot scope' using errcode = '22023';
  end if;
  foreach v_table in array array['character_stats_snapshot','team_comp_stats','player_metric_benchmarks'] loop
    select coalesce(sum(jsonb_array_length(rows)),0) into v_count
      from public.snapshot_staging_batches where run_id = p_run_id and table_name = v_table;
    if (p_expected_counts->>v_table)::bigint is null or v_count <> (p_expected_counts->>v_table)::bigint then
      raise exception 'Snapshot batch count mismatch' using errcode = '22023';
    end if;
    if v_table = 'player_metric_benchmarks' then
      delete from public.player_metric_benchmarks where patch_key = p_patch_key and period_start = p_period_start;
    else
      execute format('delete from public.%I where period_days = $1 and period_start = $2', v_table)
        using p_period_days, p_period_start;
    end if;
    for v_batch in select rows from public.snapshot_staging_batches
      where run_id = p_run_id and table_name = v_table order by batch_index loop
      v_rows := v_batch.rows;
      if exists (select 1 from jsonb_array_elements(v_rows) r where
        (r->>'period_start')::timestamptz is distinct from p_period_start or
        (r->>'period_end')::timestamptz is distinct from p_period_end or
        (v_table <> 'player_metric_benchmarks' and (r->>'period_days')::integer is distinct from p_period_days) or
        (v_table = 'player_metric_benchmarks' and r->>'patch_key' is distinct from p_patch_key)) then
        raise exception 'Snapshot row outside scope' using errcode = '22023';
      end if;
      select string_agg(format('%I', key), ',' order by key) into v_columns
        from jsonb_object_keys(v_rows->0) key
        where key not in ('id','created_at') and exists (
          select 1 from pg_catalog.pg_attribute a where a.attrelid = format('public.%I',v_table)::regclass
            and a.attname = key and a.attnum > 0 and not a.attisdropped);
      if v_columns is null then raise exception 'Invalid snapshot columns' using errcode = '22023'; end if;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1)',
        v_table, v_columns, v_columns, v_table) using v_rows;
    end loop;
  end loop;
  delete from public.snapshot_staging_batches where run_id = p_run_id;
end;
$$;

-- No SECURITY DEFINER functions and no callable public/anonymous mutation endpoints.
create or replace function public.retry_ingestion_matches(p_game_ids bigint[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if cardinality(p_game_ids) is null or cardinality(p_game_ids) not between 1 and 100
    or exists(select 1 from unnest(p_game_ids) id where id is null or id <= 0) then
    raise exception 'Invalid retry selection' using errcode = '22023';
  end if;
  update public.match_ingestion_queue set status = 'pending', attempts = 0,
    next_retry_at = now(), claimed_run_id = null, last_error = null, processed_at = null, updated_at = now()
    where game_id = any(p_game_ids) and status in ('failed','dead_letter');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on public.snapshot_staging_batches from public, anon, authenticated;
grant all on public.snapshot_staging_batches to service_role;
revoke all on function public.begin_ingestion_run(text,uuid) from public, anon, authenticated;
revoke all on function public.heartbeat_ingestion_run(bigint,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.finish_ingestion_run(bigint,uuid,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.save_ingested_game(jsonb,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.publish_snapshot_build(bigint,uuid,integer,timestamptz,timestamptz,text,jsonb) from public, anon, authenticated;
revoke all on function public.retry_ingestion_matches(bigint[]) from public, anon, authenticated;
grant execute on function public.begin_ingestion_run(text,uuid) to service_role;
grant execute on function public.heartbeat_ingestion_run(bigint,uuid,text,integer) to service_role;
grant execute on function public.finish_ingestion_run(bigint,uuid,text,integer,jsonb) to service_role;
grant execute on function public.save_ingested_game(jsonb,jsonb,boolean) to service_role;
grant execute on function public.publish_snapshot_build(bigint,uuid,integer,timestamptz,timestamptz,text,jsonb) to service_role;
grant execute on function public.retry_ingestion_matches(bigint[]) to service_role;
