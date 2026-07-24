-- Source-only rollback candidate. DO NOT APPLY without explicit owner approval.
-- Roll back the Edge rate-limit source before dropping this database support.

begin;

revoke all on function public.leader_public_intake_rate_limit_rpc(text,text,text,integer,integer,integer)
  from public, anon, authenticated, service_role;

drop function if exists public.leader_public_intake_rate_limit_rpc(text,text,text,integer,integer,integer);

drop table if exists leader_private.leader_public_intake_rate_limit_receipts;

commit;
