-- РА Лидер: read-only трассировка request_id между публичной заявкой и аудитом.
-- security_invoker сохраняет RLS базовых таблиц leader_leads и leader_public_lead_audit.
-- Static check markers:
-- with (security_invoker = true)
-- grant select on public.leader_request_trace to authenticated

create or replace view public.leader_request_trace
with (security_invoker = true) as
with latest_audit as (
  select distinct on (request_id)
    id,
    created_at,
    request_id,
    phone_normalized,
    source_page_path,
    page_url,
    referer,
    utm_source,
    utm_medium,
    utm_campaign,
    result,
    reason
  from public.leader_public_lead_audit
  where request_id is not null
  order by request_id, created_at desc
)
select
  coalesce(l.request_id, a.request_id) as request_id,
  case
    when l.id is not null and a.id is not null then 'complete'
    when l.id is not null and a.id is null then 'lead_without_audit'
    when l.id is null and a.id is not null then 'audit_without_lead'
    else 'missing'
  end as trace_status,
  l.id as lead_id,
  l.created_at as lead_created_at,
  l.status as lead_status,
  l.name as lead_name,
  l.phone as lead_phone,
  l.phone_normalized as lead_phone_normalized,
  l.service as lead_service,
  l.source_page_path as lead_source_page_path,
  l.page_url as lead_page_url,
  a.id as audit_id,
  a.created_at as audit_created_at,
  a.result as audit_result,
  a.reason as audit_reason,
  a.phone_normalized as audit_phone_normalized,
  a.source_page_path as audit_source_page_path,
  a.page_url as audit_page_url,
  a.referer as audit_referer,
  a.utm_source as audit_utm_source,
  a.utm_medium as audit_utm_medium,
  a.utm_campaign as audit_utm_campaign
from public.leader_leads l
full join latest_audit a on a.request_id = l.request_id
where coalesce(l.request_id, a.request_id) is not null;

comment on view public.leader_request_trace is 'РА Лидер: read-only трассировка request_id между leader_leads и leader_public_lead_audit. security_invoker сохраняет RLS базовых таблиц.';

revoke all on public.leader_request_trace from public;
revoke all on public.leader_request_trace from anon;
revoke all on public.leader_request_trace from authenticated;
grant select on public.leader_request_trace to authenticated;
