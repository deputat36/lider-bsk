-- STAGING ONLY.
-- Target: lider-bsk-staging / otulfnouybahfnsycxqn.

do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

-- The automatic RLS event trigger can continue invoking its owner function.
-- Browser roles must not call the SECURITY DEFINER helper through Data API RPC.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

create index if not exists leader_orders_lead_id_idx
  on public.leader_orders (lead_id);

create index if not exists leader_design_tasks_production_job_id_idx
  on public.leader_design_tasks (production_job_id);

create index if not exists leader_design_task_events_order_id_idx
  on public.leader_design_task_events (order_id);
