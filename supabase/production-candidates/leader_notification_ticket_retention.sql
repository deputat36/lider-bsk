create or replace function leader_private.leader_notification_worker_ticket()
returns text language plpgsql security definer set search_path='' as $$
declare nonce_value text:=encode(extensions.gen_random_bytes(16),'hex');
  expiry bigint:=floor(extract(epoch from now()+interval '2 minutes'));
  secret_value text; message_value text;
begin
  select worker_secret into secret_value from leader_private.leader_notification_config where id=1;
  delete from leader_private.leader_notification_wakeups where expires_at<now()-interval '1 hour';
  message_value:=nonce_value||'.'||expiry::text;
  insert into leader_private.leader_notification_wakeups(nonce,expires_at) values(nonce_value,to_timestamp(expiry));
  return message_value||'.'||encode(extensions.hmac(message_value,secret_value,'sha256'),'hex');
end $$;

revoke all on function leader_private.leader_notification_worker_ticket() from public,anon,authenticated,service_role;
