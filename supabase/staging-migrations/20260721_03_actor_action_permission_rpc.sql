-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- Service-role bridge from Edge wrappers to the private canonical matrix.
-- This migration must never be applied to production.

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
end
$guard$;

create or replace function public.leader_actor_has_crm_action_rpc(
  p_actor_id uuid,
  p_action text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select leader_private.leader_actor_has_crm_action(
    p_actor_id,
    p_action
  );
$function$;

comment on function public.leader_actor_has_crm_action_rpc(uuid, text) is
  'Staging-only service-role bridge to the private canonical CRM action matrix. Never accepts a browser role.';

revoke all on function public.leader_actor_has_crm_action_rpc(uuid, text)
  from public, anon, authenticated;
grant execute on function public.leader_actor_has_crm_action_rpc(uuid, text)
  to service_role;
