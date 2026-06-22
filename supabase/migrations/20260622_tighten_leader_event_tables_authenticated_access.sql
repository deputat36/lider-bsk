revoke all on table public.leader_lead_events from authenticated;
revoke all on table public.leader_commercial_offer_events from authenticated;

grant select, insert on table public.leader_lead_events to authenticated;
grant select, insert on table public.leader_commercial_offer_events to authenticated;

drop policy if exists "leader_lead_events_app" on public.leader_lead_events;
drop policy if exists "leader_lead_events_select_staff" on public.leader_lead_events;
drop policy if exists "leader_lead_events_insert_staff" on public.leader_lead_events;

create policy "leader_lead_events_select_staff"
on public.leader_lead_events
for select
to authenticated
using (leader_has_access());

create policy "leader_lead_events_insert_staff"
on public.leader_lead_events
for insert
to authenticated
with check (
  leader_has_access()
  and owner_id = (select auth.uid())
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "leader_commercial_offer_events_app" on public.leader_commercial_offer_events;
drop policy if exists "leader_commercial_offer_events_select_staff" on public.leader_commercial_offer_events;
drop policy if exists "leader_commercial_offer_events_insert_staff" on public.leader_commercial_offer_events;

create policy "leader_commercial_offer_events_select_staff"
on public.leader_commercial_offer_events
for select
to authenticated
using (leader_has_access());

create policy "leader_commercial_offer_events_insert_staff"
on public.leader_commercial_offer_events
for insert
to authenticated
with check (
  leader_has_access()
  and (created_by is null or created_by = (select auth.uid()))
);
