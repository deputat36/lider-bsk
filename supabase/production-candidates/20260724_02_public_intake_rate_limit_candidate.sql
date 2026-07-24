-- Source-only production candidate. DO NOT APPLY without explicit owner approval.
-- Apply before deploying the protected leader-public-lead Edge candidate.

begin;

create table if not exists leader_private.leader_public_intake_rate_limit_receipts (
  request_id text primary key,
  ip_hash text not null,
  phone_hash text,
  created_at timestamptz not null default clock_timestamp(),
  constraint leader_public_intake_rate_limit_request_id_len check (length(request_id) between 8 and 120),
  constraint leader_public_intake_rate_limit_ip_hash_hex check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint leader_public_intake_rate_limit_phone_hash_hex check (phone_hash is null or phone_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists leader_public_intake_rate_limit_ip_created_idx
  on leader_private.leader_public_intake_rate_limit_receipts (ip_hash, created_at desc);

create index if not exists leader_public_intake_rate_limit_phone_created_idx
  on leader_private.leader_public_intake_rate_limit_receipts (phone_hash, created_at desc)
  where phone_hash is not null;

alter table leader_private.leader_public_intake_rate_limit_receipts enable row level security;
revoke all on table leader_private.leader_public_intake_rate_limit_receipts from public, anon, authenticated;
grant select, insert, delete on table leader_private.leader_public_intake_rate_limit_receipts to service_role;

create or replace function public.leader_public_intake_rate_limit_rpc(
  p_request_id text,
  p_ip_hash text,
  p_phone_hash text default null,
  p_window_seconds integer default 300,
  p_ip_limit integer default 20,
  p_phone_limit integer default 5
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, leader_private
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_ip_count integer := 0;
  v_phone_count integer := 0;
  v_ip_oldest timestamptz;
  v_phone_oldest timestamptz;
  v_retry_after integer := 0;
begin
  p_request_id := btrim(coalesce(p_request_id, ''));
  p_ip_hash := lower(btrim(coalesce(p_ip_hash, '')));
  p_phone_hash := nullif(lower(btrim(coalesce(p_phone_hash, ''))), '');

  if length(p_request_id) < 8 or length(p_request_id) > 120 then
    raise exception 'request_id_invalid' using errcode = '22023';
  end if;
  if p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'ip_hash_invalid' using errcode = '22023';
  end if;
  if p_phone_hash is not null and p_phone_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'phone_hash_invalid' using errcode = '22023';
  end if;
  if p_window_seconds < 30 or p_window_seconds > 3600
     or p_ip_limit < 1 or p_ip_limit > 500
     or p_phone_limit < 1 or p_phone_limit > 100 then
    raise exception 'rate_limit_config_invalid' using errcode = '22023';
  end if;

  -- Serialize concurrent requests for the same privacy-preserving identity.
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash || ':' || coalesce(p_phone_hash, ''), 0));

  -- A retry with the same request_id must reach the normal idempotency path and must not consume quota again.
  if exists (
    select 1
    from leader_private.leader_public_intake_rate_limit_receipts
    where request_id = p_request_id
  ) then
    return jsonb_build_object(
      'allowed', true,
      'reason', 'idempotent_replay',
      'retry_after_seconds', 0,
      'idempotent_replay', true
    );
  end if;

  delete from leader_private.leader_public_intake_rate_limit_receipts
  where created_at < v_now - interval '2 days';

  v_window_start := v_now - make_interval(secs => p_window_seconds);

  select count(*), min(created_at)
    into v_ip_count, v_ip_oldest
  from leader_private.leader_public_intake_rate_limit_receipts
  where ip_hash = p_ip_hash
    and created_at >= v_window_start;

  if p_phone_hash is not null then
    select count(*), min(created_at)
      into v_phone_count, v_phone_oldest
    from leader_private.leader_public_intake_rate_limit_receipts
    where phone_hash = p_phone_hash
      and created_at >= v_window_start;
  end if;

  if v_ip_count >= p_ip_limit then
    v_retry_after := greatest(1, ceil(extract(epoch from ((v_ip_oldest + make_interval(secs => p_window_seconds)) - v_now)))::integer);
    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit_ip',
      'retry_after_seconds', v_retry_after,
      'idempotent_replay', false
    );
  end if;

  if p_phone_hash is not null and v_phone_count >= p_phone_limit then
    v_retry_after := greatest(1, ceil(extract(epoch from ((v_phone_oldest + make_interval(secs => p_window_seconds)) - v_now)))::integer);
    return jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit_phone',
      'retry_after_seconds', v_retry_after,
      'idempotent_replay', false
    );
  end if;

  insert into leader_private.leader_public_intake_rate_limit_receipts (
    request_id, ip_hash, phone_hash, created_at
  ) values (
    p_request_id, p_ip_hash, p_phone_hash, v_now
  );

  return jsonb_build_object(
    'allowed', true,
    'reason', 'allowed',
    'retry_after_seconds', 0,
    'idempotent_replay', false
  );
end
$function$;

revoke all on function public.leader_public_intake_rate_limit_rpc(text,text,text,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.leader_public_intake_rate_limit_rpc(text,text,text,integer,integer,integer)
  to service_role;

-- Postconditions.
do $postflight$
begin
  if has_function_privilege('anon', 'public.leader_public_intake_rate_limit_rpc(text,text,text,integer,integer,integer)', 'EXECUTE') then
    raise exception 'rate limit candidate failed: anon EXECUTE remains';
  end if;
  if has_function_privilege('authenticated', 'public.leader_public_intake_rate_limit_rpc(text,text,text,integer,integer,integer)', 'EXECUTE') then
    raise exception 'rate limit candidate failed: authenticated EXECUTE remains';
  end if;
  if not has_function_privilege('service_role', 'public.leader_public_intake_rate_limit_rpc(text,text,text,integer,integer,integer)', 'EXECUTE') then
    raise exception 'rate limit candidate failed: service_role EXECUTE missing';
  end if;
end
$postflight$;

commit;
