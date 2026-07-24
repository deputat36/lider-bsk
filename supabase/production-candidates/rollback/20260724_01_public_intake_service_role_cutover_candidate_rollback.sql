-- Source-only rollback candidate. DO NOT APPLY without explicit owner approval.
-- Restores the confirmed 2026-07-24 public INSERT baseline if protected cutover must be rolled back.

begin;

-- Rollback is unsafe if the protected Edge source is still deployed without a working backend credential.
-- Operator must first restore the previous Edge version or confirm public writes are required temporarily.

drop policy if exists leader_leads_insert_app on public.leader_leads;

create policy leader_leads_insert_public_safe
on public.leader_leads
for insert
to anon, authenticated
with check (
  coalesce(nullif(trim(phone), ''), nullif(trim(message), '')) is not null
  and length(coalesce(name, '')) <= 200
  and length(coalesce(phone, '')) <= 80
  and length(coalesce(message, '')) <= 2000
  and length(coalesce(source, '')) <= 120
  and length(coalesce(service, '')) <= 200
);

grant insert on table public.leader_leads to anon, authenticated;

create policy leader_public_lead_audit_insert_public
on public.leader_public_lead_audit
for insert
to anon
with check (
  request_id is not null
  and length(request_id) between 8 and 120
  and result = any (array['accepted','duplicate','suspicious','rejected','error'])
  and jsonb_typeof(payload) = 'object'
  and pg_column_size(payload) <= 65536
  and created_at >= now() - interval '5 minutes'
  and created_at <= now() + interval '1 minute'
  and length(coalesce(phone_normalized, '')) <= 32
  and length(coalesce(source_page_path, '')) <= 500
  and length(coalesce(page_url, '')) <= 1000
  and length(coalesce(user_agent, '')) <= 500
  and length(coalesce(referer, '')) <= 1000
  and length(coalesce(utm_source, '')) <= 120
  and length(coalesce(utm_medium, '')) <= 120
  and length(coalesce(utm_campaign, '')) <= 200
  and length(coalesce(reason, '')) <= 120
);

grant insert on table public.leader_public_lead_audit to anon;

commit;
