revoke execute on function public.leader_create_order_rpc(jsonb) from public;
revoke execute on function public.leader_create_order_rpc(jsonb) from anon;
revoke execute on function public.leader_create_order_rpc(jsonb) from authenticated;

comment on function public.leader_create_order_rpc(jsonb)
is 'Legacy direct order creation RPC. Direct client execution is disabled; CRM order creation should use approved Edge Function actions.';
