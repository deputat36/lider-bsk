-- STAGING ONLY.
-- Browser-authenticated adapter for the existing atomic lead workflow action.
-- Never apply to production without a separate approval and rollout plan.

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

  if to_regprocedure('public.leader_update_lead_workflow_rpc(jsonb)') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null then
    raise exception 'staging_lead_workflow_rpc_dependencies_missing';
  end if;
end
$guard$;

create or replace function public.leader_update_lead_workflow_browser_rpc(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_email text := left(btrim(coalesce((select auth.jwt() ->> 'email'), '')), 320);
begin
  if v_actor_id is null then
    return jsonb_build_object(
      'ok', false,
      'request_id', null,
      'error', jsonb_build_object('code', 'auth_required', 'message', 'Authenticated CRM session is required')
    );
  end if;

  return public.leader_update_lead_workflow_rpc(jsonb_build_object(
    'actor_id', v_actor_id,
    'actor_email', v_actor_email,
    'request', p_request
  ));
end
$function$;

comment on function public.leader_update_lead_workflow_browser_rpc(jsonb) is
  'STAGING ONLY. Authenticated browser adapter; actor identity is resolved exclusively through auth.uid().';

revoke all on function public.leader_update_lead_workflow_browser_rpc(jsonb) from public, anon, authenticated;
grant execute on function public.leader_update_lead_workflow_browser_rpc(jsonb) to authenticated, service_role;
