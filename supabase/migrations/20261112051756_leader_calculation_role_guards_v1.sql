-- Add canonical role checks to the legacy direct calculation API.
-- No business rows, existing policies, role matrix or service-role rights are changed.
set lock_timeout = '3s';
set statement_timeout = '15s';
do $preflight$ begin
 if to_regprocedure('leader_private.leader_has_crm_action(text)') is null then
  raise exception 'canonical_permission_helper_missing';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('leader_lead_calculations','leader_lead_calculation_items') and not c.relrowsecurity) then
  raise exception 'calculation_rls_required';
 end if;
 if (select count(*) from leader_private.leader_role_action_matrix_v1 where role in ('owner','admin','manager') and array['calculations.read','calculations.write']::text[] <@ allowed_actions)<>3 then
  raise exception 'owner_admin_manager_calculation_actions_required';
 end if;
end $preflight$;

create policy leader_calculations_canonical_select_v1
on public.leader_lead_calculations as restrictive for select to authenticated
using ((select leader_private.leader_has_crm_action('calculations.read')));

create policy leader_calculations_canonical_insert_v1
on public.leader_lead_calculations as restrictive for insert to authenticated
with check ((select leader_private.leader_has_crm_action('calculations.write')));

create policy leader_calculations_canonical_update_v1
on public.leader_lead_calculations as restrictive for update to authenticated
using ((select leader_private.leader_has_crm_action('calculations.write')))
with check ((select leader_private.leader_has_crm_action('calculations.write')));

create policy leader_calculations_canonical_delete_v1
on public.leader_lead_calculations as restrictive for delete to authenticated
using ((select leader_private.leader_has_crm_action('calculations.write')));

revoke all on table public.leader_lead_calculations from anon;
revoke truncate, references, trigger, maintain on table public.leader_lead_calculations from authenticated;

create policy leader_calculation_items_canonical_select_v1
on public.leader_lead_calculation_items as restrictive for select to authenticated
using ((select leader_private.leader_has_crm_action('calculations.read')));

create policy leader_calculation_items_canonical_insert_v1
on public.leader_lead_calculation_items as restrictive for insert to authenticated
with check ((select leader_private.leader_has_crm_action('calculations.write')));

create policy leader_calculation_items_canonical_update_v1
on public.leader_lead_calculation_items as restrictive for update to authenticated
using ((select leader_private.leader_has_crm_action('calculations.write')))
with check ((select leader_private.leader_has_crm_action('calculations.write')));

create policy leader_calculation_items_canonical_delete_v1
on public.leader_lead_calculation_items as restrictive for delete to authenticated
using ((select leader_private.leader_has_crm_action('calculations.write')));

revoke all on table public.leader_lead_calculation_items from anon;
revoke truncate, references, trigger, maintain on table public.leader_lead_calculation_items from authenticated;
