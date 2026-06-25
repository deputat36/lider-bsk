-- РА Лидер: corrective migration after creating leader_request_trace.
-- Гарантирует, что view остаётся read-only для CRM и недоступна anon/public.

revoke all on public.leader_request_trace from public;
revoke all on public.leader_request_trace from anon;
revoke all on public.leader_request_trace from authenticated;
grant select on public.leader_request_trace to authenticated;
