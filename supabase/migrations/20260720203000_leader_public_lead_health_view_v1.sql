create or replace view public.leader_public_lead_health_v1
with (security_invoker = true)
as
select
  created_at::date as day,
  count(*)::bigint as total_attempts,
  count(*) filter (where result = 'accepted')::bigint as accepted,
  count(*) filter (where result = 'duplicate')::bigint as duplicate,
  count(*) filter (where result = 'suspicious')::bigint as suspicious,
  count(*) filter (where result = 'rejected')::bigint as rejected,
  count(*) filter (where result = 'error')::bigint as errors,
  round(
    100.0 * count(*) filter (where result = 'accepted')
    / nullif(count(*), 0),
    2
  ) as accepted_rate_percent,
  max(created_at) as last_event_at
from public.leader_public_lead_audit
group by created_at::date;

comment on view public.leader_public_lead_health_v1 is
'РА Лидер: обезличенная дневная сводка работы публичной формы сайта. Доступ наследуется через RLS таблицы leader_public_lead_audit.';

revoke all on public.leader_public_lead_health_v1 from anon;
grant select on public.leader_public_lead_health_v1 to authenticated;
