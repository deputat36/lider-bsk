-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Depends on 20260715_02_calculation_version_harness.sql.
-- Moves the persistence implementation into leader_private and exposes only a safe public response projection.

do $guard$
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if to_regprocedure('public.leader_create_calculation_version_rpc(jsonb)') is null
     and to_regprocedure('leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)') is null then
    raise exception 'calculation_version_base_rpc_missing';
  end if;
end
$guard$;

do $move_internal$
begin
  if to_regprocedure('leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)') is null then
    alter function public.leader_create_calculation_version_rpc(jsonb)
      rename to leader_create_calculation_version_rpc_internal_v1;

    alter function public.leader_create_calculation_version_rpc_internal_v1(jsonb)
      set schema leader_private;
  end if;
end
$move_internal$;

revoke all on function leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb) from public;
revoke all on function leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb) from anon;
revoke all on function leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb) from authenticated;
grant execute on function leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb) to service_role;

create or replace function public.leader_create_calculation_version_rpc(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_raw jsonb;
  v_safe jsonb;
  v_calculation jsonb;
  v_items jsonb := '[]'::jsonb;
  v_idempotency_key text;
begin
  v_raw := leader_private.leader_create_calculation_version_rpc_internal_v1(p_payload);

  if coalesce((v_raw ->> 'ok')::boolean, false) is not true then
    return v_raw;
  end if;

  v_calculation := jsonb_build_object(
    'id', v_raw #> '{calculation,id}',
    'lead_id', v_raw #> '{calculation,lead_id}',
    'need_id', v_raw #> '{calculation,need_id}',
    'client_id', v_raw #> '{calculation,client_id}',
    'title', v_raw #> '{calculation,title}',
    'status', v_raw #> '{calculation,status}',
    'version_number', v_raw #> '{calculation,version_number}',
    'client_total', v_raw #> '{calculation,client_total}',
    'contractor_cost', v_raw #> '{calculation,contractor_cost}',
    'profit', v_raw #> '{calculation,profit}',
    'margin_percent', v_raw #> '{calculation,margin_percent}',
    'warning_level', v_raw #> '{calculation,warning_level}',
    'warnings', coalesce(v_raw #> '{calculation,warnings}', '[]'::jsonb),
    'public_comment', v_raw #> '{calculation,public_comment}',
    'internal_comment', v_raw #> '{calculation,internal_comment}',
    'created_at', v_raw #> '{calculation,created_at}',
    'updated_at', v_raw #> '{calculation,updated_at}'
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item -> 'id',
        'catalog_id', item -> 'catalog_id',
        'category', item -> 'category',
        'item_type', item -> 'item_type',
        'name', item -> 'name',
        'unit', item -> 'unit',
        'qty', item -> 'qty',
        'contractor_price', item -> 'contractor_price',
        'contractor_sum', item -> 'contractor_sum',
        'markup_percent', item -> 'markup_percent',
        'client_price', item -> 'client_price',
        'client_sum', item -> 'client_sum',
        'profit', item -> 'profit',
        'margin_percent', item -> 'margin_percent',
        'comment', item -> 'comment',
        'data', coalesce(item -> 'data', '{}'::jsonb),
        'sort_order', item -> 'sort_order',
        'created_at', item -> 'created_at',
        'updated_at', item -> 'updated_at'
      )
      order by ordinality
    ),
    '[]'::jsonb
  )
  into v_items
  from jsonb_array_elements(coalesce(v_raw -> 'items', '[]'::jsonb))
    with ordinality as rows(item, ordinality);

  v_safe := jsonb_build_object(
    'ok', true,
    'request_id', v_raw -> 'request_id',
    'source_calculation_id', v_raw -> 'source_calculation_id',
    'calculation', v_calculation,
    'items', v_items,
    'idempotent_replay', coalesce((v_raw ->> 'idempotent_replay')::boolean, false)
  );

  v_idempotency_key := nullif(btrim(p_payload #>> '{request,payload,idempotency_key}'), '');

  if v_idempotency_key is not null then
    update leader_private.leader_command_receipts
    set response = v_safe,
        updated_at = now()
    where action = 'calculation.create_version'
      and idempotency_key = v_idempotency_key
      and state = 'success';
  end if;

  return v_safe;
end
$function$;

revoke all on function public.leader_create_calculation_version_rpc(jsonb) from public;
revoke all on function public.leader_create_calculation_version_rpc(jsonb) from anon;
revoke all on function public.leader_create_calculation_version_rpc(jsonb) from authenticated;
grant execute on function public.leader_create_calculation_version_rpc(jsonb) to service_role;

comment on function leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb) is
  'STAGING ONLY: private atomic persistence implementation. Never expose through browser or Data API.';

comment on function public.leader_create_calculation_version_rpc(jsonb) is
  'STAGING ONLY: service-role wrapper returning an explicit privacy-safe calculation and item projection.';
