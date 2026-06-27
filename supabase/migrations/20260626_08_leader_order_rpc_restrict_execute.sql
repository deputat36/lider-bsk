revoke all on function public.leader_create_order_from_offer_rpc(jsonb) from anon;
revoke all on function public.leader_create_order_from_offer_rpc(jsonb) from authenticated;
revoke all on function public.leader_create_order_from_offer_rpc(jsonb) from public;
grant execute on function public.leader_create_order_from_offer_rpc(jsonb) to service_role;