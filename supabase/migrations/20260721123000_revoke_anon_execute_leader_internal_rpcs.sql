-- Remove unnecessary anonymous execution rights from internal RA Leader RPCs.
-- This migration intentionally preserves authenticated and service_role grants.

begin;

revoke execute on function public.leader_add_status_history(uuid, text, text, text) from anon;
revoke execute on function public.leader_create_task(text, uuid, text, text, timestamptz, text) from anon;
revoke execute on function public.leader_dashboard_metrics() from anon;

-- Trigger functions do not need to be callable through PostgREST.
-- PUBLIC currently grants EXECUTE transitively to anon, so both grants are removed.
revoke execute on function public.leader_normalize_invite_email() from public;
revoke execute on function public.leader_normalize_invite_email() from anon;

-- Fail closed if an anonymous route remains after the ACL change.
do $migration_check$
begin
  if has_function_privilege('anon', 'public.leader_add_status_history(uuid,text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'anon still has EXECUTE on leader_add_status_history';
  end if;

  if has_function_privilege('anon', 'public.leader_create_task(text,uuid,text,text,timestamptz,text)'::regprocedure, 'EXECUTE') then
    raise exception 'anon still has EXECUTE on leader_create_task';
  end if;

  if has_function_privilege('anon', 'public.leader_dashboard_metrics()'::regprocedure, 'EXECUTE') then
    raise exception 'anon still has EXECUTE on leader_dashboard_metrics';
  end if;

  if has_function_privilege('anon', 'public.leader_normalize_invite_email()'::regprocedure, 'EXECUTE') then
    raise exception 'anon still has EXECUTE on leader_normalize_invite_email';
  end if;

  if not has_function_privilege('authenticated', 'public.leader_add_status_history(uuid,text,text,text)'::regprocedure, 'EXECUTE') then
    raise exception 'authenticated lost EXECUTE on leader_add_status_history';
  end if;

  if not has_function_privilege('authenticated', 'public.leader_create_task(text,uuid,text,text,timestamptz,text)'::regprocedure, 'EXECUTE') then
    raise exception 'authenticated lost EXECUTE on leader_create_task';
  end if;

  if not has_function_privilege('authenticated', 'public.leader_dashboard_metrics()'::regprocedure, 'EXECUTE') then
    raise exception 'authenticated lost EXECUTE on leader_dashboard_metrics';
  end if;
end
$migration_check$;

commit;
