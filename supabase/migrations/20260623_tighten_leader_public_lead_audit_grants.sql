-- Tighten table-level grants for public lead audit.
-- RLS policies already restrict row access; these grants keep Data API privileges minimal.
-- Static check markers:
-- grant insert on public.leader_public_lead_audit to anon
-- grant select on public.leader_public_lead_audit to authenticated

revoke select, update, delete, truncate, references, trigger
on table public.leader_public_lead_audit
from anon;

revoke insert, update, delete, truncate, references, trigger
on table public.leader_public_lead_audit
from authenticated;

grant insert
on table public.leader_public_lead_audit
to anon;

grant select
on table public.leader_public_lead_audit
to authenticated;
