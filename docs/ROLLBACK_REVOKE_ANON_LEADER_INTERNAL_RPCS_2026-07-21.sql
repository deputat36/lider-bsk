-- Emergency rollback for migration:
-- 20260721123000_revoke_anon_execute_leader_internal_rpcs.sql
--
-- Run only if the ACL hardening causes a confirmed regression.

begin;

grant execute on function public.leader_add_status_history(uuid, text, text, text) to anon;
grant execute on function public.leader_create_task(text, uuid, text, text, timestamptz, text) to anon;
grant execute on function public.leader_dashboard_metrics() to anon;

-- Restore the original trigger-function ACL exactly as observed on 2026-07-21.
grant execute on function public.leader_normalize_invite_email() to public;
grant execute on function public.leader_normalize_invite_email() to anon;

commit;
