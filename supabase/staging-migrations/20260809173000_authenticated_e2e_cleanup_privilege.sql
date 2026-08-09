-- STAGING ONLY. Ensure the service-only synthetic cleanup can remove every child table.
do $guard$
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton=true and project_ref='otulfnouybahfnsycxqn'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;
end
$guard$;

alter function public.leader_cleanup_authenticated_e2e_rpc(text) security definer;
alter function public.leader_cleanup_authenticated_e2e_rpc(text) set search_path='';
revoke all on function public.leader_cleanup_authenticated_e2e_rpc(text) from public, anon, authenticated;
grant execute on function public.leader_cleanup_authenticated_e2e_rpc(text) to service_role;
