-- STAGING ONLY.
-- Tighten production_job.create_from_order layout evidence.
-- Target: otulfnouybahfnsycxqn. Never apply to production.

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if to_regprocedure('public.leader_create_production_job_from_order_rpc(jsonb)') is null then
    raise exception 'staging_production_create_rpc_missing';
  end if;
end
$guard$;

do $rename$
begin
  if to_regprocedure('public.leader_create_production_job_from_order_impl_rpc(jsonb)') is null then
    alter function public.leader_create_production_job_from_order_rpc(jsonb)
      rename to leader_create_production_job_from_order_impl_rpc;
  end if;
end
$rename$;

create or replace function leader_private.leader_layout_is_approved(p_status text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  with normalized as (
    select lower(replace(btrim(coalesce(p_status, '')), 'ё', 'е')) as value
  )
  select case
    when value = '' then false
    when value like '%на согласовании%'
      or value like '%согласование%'
      or value like '%правк%'
      or value like '%не готов%'
      or value like '%ожид%'
      or value like '%нужен%'
      or value like '%не проверен%'
      then false
    when value like '%не требуется%' then true
    when value like '%согласован%'
      or value like '%утвержден%'
      or value = 'готов'
      or value like '%готовый макет%'
      then true
    else false
  end
  from normalized;
$function$;

revoke all on function leader_private.leader_layout_is_approved(text)
  from public, anon, authenticated;
grant execute on function leader_private.leader_layout_is_approved(text)
  to service_role;

create or replace function public.leader_create_production_job_from_order_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request jsonb;
  v_payload jsonb;
  v_request_id uuid;
  v_order_id uuid;
  v_design_task_id uuid;
  v_order_layout_status text;
  v_design_layout_status text;
  v_design_approved_at timestamptz;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return leader_private.leader_production_command_error(null, 'validation_error', 'RPC payload must be an object');
  end if;

  v_request := p_payload -> 'request';
  v_payload := v_request -> 'payload';
  begin
    v_request_id := nullif(btrim(coalesce(v_request ->> 'request_id', '')), '')::uuid;
    v_order_id := nullif(btrim(coalesce(v_payload ->> 'order_id', '')), '')::uuid;
    v_design_task_id := nullif(btrim(coalesce(v_payload ->> 'design_task_id', '')), '')::uuid;
  exception when others then
    return public.leader_create_production_job_from_order_impl_rpc(p_payload);
  end;

  if v_order_id is not null then
    select layout_status into v_order_layout_status
    from public.leader_orders
    where id = v_order_id;

    if found and not leader_private.leader_layout_is_approved(v_order_layout_status) then
      return leader_private.leader_production_command_error(
        v_request_id,
        'validation_error',
        'Order layout is not approved'
      );
    end if;
  end if;

  if v_design_task_id is not null then
    select layout_status, approved_at
    into v_design_layout_status, v_design_approved_at
    from public.leader_design_tasks
    where id = v_design_task_id;

    if found
       and v_design_approved_at is null
       and not leader_private.leader_layout_is_approved(v_design_layout_status) then
      return leader_private.leader_production_command_error(
        v_request_id,
        'validation_error',
        'Design task does not prove layout approval'
      );
    end if;
  end if;

  return public.leader_create_production_job_from_order_impl_rpc(p_payload);
end
$function$;

revoke all on function public.leader_create_production_job_from_order_impl_rpc(jsonb)
  from public, anon, authenticated;
grant execute on function public.leader_create_production_job_from_order_impl_rpc(jsonb)
  to service_role;

revoke all on function public.leader_create_production_job_from_order_rpc(jsonb)
  from public, anon, authenticated;
grant execute on function public.leader_create_production_job_from_order_rpc(jsonb)
  to service_role;

comment on function public.leader_create_production_job_from_order_rpc(jsonb) is
  'STAGING ONLY strict layout gate for production_job.create_from_order.';

do $verify$
begin
  if leader_private.leader_layout_is_approved('Макет согласован') is not true
     or leader_private.leader_layout_is_approved('Не требуется') is not true
     or leader_private.leader_layout_is_approved('На согласовании') is not false
     or leader_private.leader_layout_is_approved('Нужны правки') is not false then
    raise exception 'staging_layout_approval_gate_invalid';
  end if;
end
$verify$;
