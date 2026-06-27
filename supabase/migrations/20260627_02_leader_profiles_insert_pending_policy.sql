drop policy if exists leader_profiles_insert_admin_or_self_safe on public.leader_user_profiles;
drop policy if exists leader_profiles_insert_admin_or_self_pending on public.leader_user_profiles;

create policy leader_profiles_insert_admin_or_self_pending
on public.leader_user_profiles
for insert
to authenticated
with check (
  (select leader_private.leader_is_admin())
  or (
    user_id = (select auth.uid())
    and role = 'manager'
    and is_active = false
    and coalesce(permissions, '{}'::jsonb) = '{}'::jsonb
  )
);
