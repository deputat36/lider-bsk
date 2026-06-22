revoke all on table public.leader_lead_events from anon;
revoke all on table public.leader_commercial_offer_events from anon;

comment on table public.leader_lead_events is 'Internal CRM lead timeline events. Accessible to authenticated Leader staff through RLS only.';
comment on table public.leader_commercial_offer_events is 'Internal CRM commercial offer timeline events. Accessible to authenticated Leader staff through RLS only.';
