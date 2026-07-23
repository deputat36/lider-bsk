-- SOURCE-ONLY PRODUCTION ROLLBACK CANDIDATE.
-- Target project: lider-bsk production / ofewxuqfjhamgerwzull.
-- DO NOT APPLY without an explicit production rollback approval.
-- This rollback is allowed only before installation read/update RPC installation
-- and before any durable command receipt has been created.

begin;

do $preflight$
begin
  if to_regclass('leader_staging.environment_guard') is not null then
    raise exception 'production_rollback_rejected_on_staging';
  end if;

  if to_regprocedure('public.leader_read_installation_job_rpc(uuid,uuid)') is not null
     or to_regprocedure('public.leader_update_installation_job_rpc(jsonb)') is not null then
    raise exception 'installation_rpc_dependency_present';
  end if;

  if to_regclass('leader_private.leader_command_receipts') is not null
     and exists (select 1 from leader_private.leader_command_receipts limit 1) then
    raise exception 'command_receipts_not_empty';
  end if;
end
$preflight$;

drop function if exists public.leader_actor_has_crm_action_rpc(uuid, text);
drop function if exists leader_private.leader_actor_has_crm_action(uuid, text);
drop table if exists leader_private.leader_command_receipts;
drop table if exists leader_private.leader_role_action_matrix_v1;

-- Deliberately preserve leader_private schema and all unrelated CRM objects.
commit;
