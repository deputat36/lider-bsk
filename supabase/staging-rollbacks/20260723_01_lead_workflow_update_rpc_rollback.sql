-- STAGING ONLY rollback for 20260723153001 / staging_lead_workflow_update_rpc_20260723.
-- Refuses to remove the command while durable workflow receipts exist.

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

  if to_regclass('leader_private.leader_command_receipts') is not null
     and exists (
       select 1
       from leader_private.leader_command_receipts
       where action = 'lead_workflow.update'
     ) then
    raise exception 'lead_workflow_rollback_blocked_by_receipts';
  end if;
end
$guard$;

revoke all on function public.leader_update_lead_workflow_rpc(jsonb) from public, anon, authenticated, service_role;
drop function if exists public.leader_update_lead_workflow_rpc(jsonb);
drop function if exists leader_private.leader_lead_status_requires_future_contact(text);
drop function if exists leader_private.leader_lead_status_requires_assignee(text);
drop function if exists leader_private.leader_lead_workflow_error(uuid,text,text);
