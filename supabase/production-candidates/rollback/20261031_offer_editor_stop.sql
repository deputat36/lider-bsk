-- Safe stop: keep historical rows, receipts, immutable content and closed browser writes.
-- Restore the preceding reviewed UI/Edge bundle separately; do not reopen broad ACLs.
begin;
set local lock_timeout='5s';
revoke execute on function public.leader_update_offer_rpc(jsonb) from service_role;
do $$ begin
  if has_function_privilege('service_role','public.leader_update_offer_rpc(jsonb)','EXECUTE')
     or has_any_column_privilege('authenticated','public.leader_commercial_offers','UPDATE') then
    raise exception 'leader_offer_editor_stop_failed';
  end if;
end $$;
commit;
