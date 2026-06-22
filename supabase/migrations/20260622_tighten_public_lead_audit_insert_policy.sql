drop policy if exists "leader_public_lead_audit_insert_public" on public.leader_public_lead_audit;

create policy "leader_public_lead_audit_insert_public"
on public.leader_public_lead_audit
for insert
to anon
with check (
  request_id is not null
  and length(request_id) between 8 and 120
  and result in ('accepted', 'duplicate', 'suspicious', 'rejected', 'error')
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

comment on policy "leader_public_lead_audit_insert_public" on public.leader_public_lead_audit
is 'Allow public audit writes only for expected public lead audit shape. Main lead creation must not depend on audit writes.';
