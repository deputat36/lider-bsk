revoke execute on function public.leader_log(text, text, text, jsonb) from public;
revoke execute on function public.leader_log(text, text, text, jsonb) from anon;
revoke execute on function public.leader_log(text, text, text, jsonb) from authenticated;

comment on function public.leader_log(text, text, text, jsonb)
is 'Internal activity logging helper. Direct client RPC execution is disabled; use application flows that write their own audited events.';
