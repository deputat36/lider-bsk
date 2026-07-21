-- STAGING ONLY.
-- Target project: otulfnouybahfnsycxqn.

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

alter table leader_private.leader_role_action_matrix_v1 enable row level security;

drop policy if exists leader_role_action_matrix_v1_deny_client
  on leader_private.leader_role_action_matrix_v1;

create policy leader_role_action_matrix_v1_deny_client
on leader_private.leader_role_action_matrix_v1
for all
to anon, authenticated
using (false)
with check (false);

revoke all on table leader_private.leader_role_action_matrix_v1 from public, anon, authenticated;
grant select, insert, update, delete on table leader_private.leader_role_action_matrix_v1 to service_role;
