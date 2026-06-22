create schema if not exists leader_private;

revoke all on schema leader_private from public;
grant usage on schema leader_private to authenticated;
grant usage on schema leader_private to service_role;

alter function public.leader_has_access() set schema leader_private;
alter function public.leader_is_admin() set schema leader_private;

revoke execute on function leader_private.leader_has_access() from public;
revoke execute on function leader_private.leader_has_access() from anon;
revoke execute on function leader_private.leader_is_admin() from public;
revoke execute on function leader_private.leader_is_admin() from anon;

grant execute on function leader_private.leader_has_access() to authenticated;
grant execute on function leader_private.leader_has_access() to service_role;
grant execute on function leader_private.leader_is_admin() to authenticated;
grant execute on function leader_private.leader_is_admin() to service_role;

comment on schema leader_private is 'Private helper schema for RA Lider database helpers that are used by RLS but should not be exposed as public REST RPC functions.';
comment on function leader_private.leader_has_access() is 'RA Lider RLS helper. Kept executable for authenticated RLS checks, moved out of exposed public schema.';
comment on function leader_private.leader_is_admin() is 'RA Lider admin RLS helper. Kept executable for authenticated RLS checks, moved out of exposed public schema.';

do $$
begin
  if to_regprocedure('public.leader_has_access()') is not null then
    raise exception 'public.leader_has_access() still exists';
  end if;

  if to_regprocedure('public.leader_is_admin()') is not null then
    raise exception 'public.leader_is_admin() still exists';
  end if;

  if to_regprocedure('leader_private.leader_has_access()') is null then
    raise exception 'leader_private.leader_has_access() is missing';
  end if;

  if to_regprocedure('leader_private.leader_is_admin()') is null then
    raise exception 'leader_private.leader_is_admin() is missing';
  end if;

  if not has_function_privilege('authenticated', 'leader_private.leader_has_access()', 'EXECUTE') then
    raise exception 'authenticated cannot execute leader_private.leader_has_access()';
  end if;

  if not has_function_privilege('authenticated', 'leader_private.leader_is_admin()', 'EXECUTE') then
    raise exception 'authenticated cannot execute leader_private.leader_is_admin()';
  end if;

  if has_function_privilege('anon', 'leader_private.leader_has_access()', 'EXECUTE') then
    raise exception 'anon can execute leader_private.leader_has_access()';
  end if;

  if has_function_privilege('anon', 'leader_private.leader_is_admin()', 'EXECUTE') then
    raise exception 'anon can execute leader_private.leader_is_admin()';
  end if;
end $$;
