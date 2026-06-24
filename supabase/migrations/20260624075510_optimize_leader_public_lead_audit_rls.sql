drop policy if exists leader_public_lead_audit_select_staff
on public.leader_public_lead_audit;

create policy leader_public_lead_audit_select_staff
on public.leader_public_lead_audit
for select
to authenticated
using (
  exists (
    select 1
    from public.leader_user_profiles p
    where p.user_id = (select auth.uid())
      and coalesce(p.is_active, true) = true
      and p.role = any (array['owner'::text, 'admin'::text, 'manager'::text])
  )
);
