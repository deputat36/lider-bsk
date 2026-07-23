-- SOURCE-ONLY PRODUCTION RPC ROLLBACK CANDIDATE.
-- Target project: lider-bsk production / ofewxuqfjhamgerwzull.
-- DO NOT APPLY without an explicit production rollback approval.
-- Preserves canonical RBAC core and leader_command_receipts table.

begin;

do $production_rollback_preflight$
begin
  if to_regclass('leader_staging.environment_guard') is not null then
    raise exception 'production_rpc_rollback_rejected_on_staging';
  end if;

  if to_regclass('leader_private.leader_command_receipts') is not null
     and exists (
       select 1
       from leader_private.leader_command_receipts
       where action = 'installation_job.update'
       limit 1
     ) then
    raise exception 'installation_command_receipts_present';
  end if;
end
$production_rollback_preflight$;

drop function if exists public.leader_update_installation_job_rpc(jsonb);
drop function if exists leader_private.leader_installation_transition_allowed(text, text);
drop function if exists leader_private.leader_installation_status_label(text);
drop function if exists leader_private.leader_installation_status_key(text);
drop function if exists leader_private.leader_installation_command_error(uuid, text, text);
drop function if exists public.leader_read_installation_job_rpc(uuid, uuid);

-- Deliberately preserve:
-- - leader_private.leader_role_action_matrix_v1
-- - leader_private.leader_actor_has_crm_action(uuid,text)
-- - public.leader_actor_has_crm_action_rpc(uuid,text)
-- - leader_private.leader_command_receipts
-- - all public CRM tables and data
commit;
