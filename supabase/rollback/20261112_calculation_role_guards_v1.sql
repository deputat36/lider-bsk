-- Emergency rollback of only this package, after diagnosing a failed postflight.
-- Original permissive policies and all business rows were left intact.
set lock_timeout='3s';
set statement_timeout='15s';
drop policy if exists leader_calculations_canonical_select_v1 on public.leader_lead_calculations;
drop policy if exists leader_calculations_canonical_insert_v1 on public.leader_lead_calculations;
drop policy if exists leader_calculations_canonical_update_v1 on public.leader_lead_calculations;
drop policy if exists leader_calculations_canonical_delete_v1 on public.leader_lead_calculations;
grant all on table public.leader_lead_calculations to anon;
grant truncate,references,trigger,maintain on table public.leader_lead_calculations to authenticated;
drop policy if exists leader_calculation_items_canonical_select_v1 on public.leader_lead_calculation_items;
drop policy if exists leader_calculation_items_canonical_insert_v1 on public.leader_lead_calculation_items;
drop policy if exists leader_calculation_items_canonical_update_v1 on public.leader_lead_calculation_items;
drop policy if exists leader_calculation_items_canonical_delete_v1 on public.leader_lead_calculation_items;
grant all on table public.leader_lead_calculation_items to anon;
grant truncate,references,trigger,maintain on table public.leader_lead_calculation_items to authenticated;
