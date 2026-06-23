-- Tighten table-level grants for public leads.
-- Public website only needs INSERT through the public Edge Function/REST path.
-- Signed-in CRM users keep CRUD privileges needed by current RLS policies.

revoke select, update, delete, truncate, references, trigger
on table public.leader_leads
from anon;

revoke truncate, references, trigger
on table public.leader_leads
from authenticated;

grant insert
on table public.leader_leads
to anon;

grant select, insert, update, delete
on table public.leader_leads
to authenticated;
