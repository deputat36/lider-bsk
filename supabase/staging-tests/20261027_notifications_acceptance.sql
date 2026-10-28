-- Synthetic profiles/queue exist only inside this transaction. pg_net sends after COMMIT;
-- ROLLBACK therefore prevents all external delivery, including on a test failure.
begin;
do $$ begin
 if exists(select 1 from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-0000000009%') then raise exception 'notification_fixture_collision';end if;
end $$;
insert into public.leader_user_profiles(user_id,role,is_active,full_name) values
 ('90000000-0000-4000-8000-000000000901','owner',true,'Synthetic notification owner'),
 ('90000000-0000-4000-8000-000000000902','manager',true,'Synthetic notification manager'),
 ('90000000-0000-4000-8000-000000000903','contractor',true,'Synthetic forbidden actor');
-- Production invite guard intentionally creates every new profile inactive.
-- Set roles only on the reserved synthetic rows inside this rolled-back transaction.
update public.leader_user_profiles set is_active=true,role=case user_id
 when '90000000-0000-4000-8000-000000000901' then 'owner'
 when '90000000-0000-4000-8000-000000000902' then 'manager' else 'contractor' end
 where user_id in ('90000000-0000-4000-8000-000000000901','90000000-0000-4000-8000-000000000902','90000000-0000-4000-8000-000000000903');
update leader_private.leader_notification_config set enabled=true,dispatch_url='https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-crm-notifications' where id=1;
do $$ begin perform set_config('leader.test_notification_ticket',leader_private.leader_notification_worker_ticket(),true);end $$;
set local role service_role;
do $$
declare owner_id uuid:='90000000-0000-4000-8000-000000000901'; manager_id uuid:='90000000-0000-4000-8000-000000000902'; result jsonb; batch jsonb; job jsonb; prepared jsonb;
begin
 if has_function_privilege('anon','public.leader_notifications_command_rpc(uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.leader_notification_worker_rpc(text,text,jsonb)','EXECUTE') then raise exception 'notification_rpc_exposed';end if;
 result:=public.leader_notifications_command_rpc(owner_id,'keys.ensure',jsonb_build_object('publicKey',repeat('A',87),'privateKey',repeat('B',43)));
 if result->>'ok' is distinct from 'true' then raise exception 'key_initialization';end if;
 result:=public.leader_notifications_command_rpc('90000000-0000-4000-8000-000000000903','status','{}');
 if result->>'error' is distinct from 'forbidden' then raise exception 'contractor_access';end if;
 result:=public.leader_notifications_command_rpc(owner_id,'subscribe',jsonb_build_object('public_key',(select public_key from leader_private.leader_notification_config where id=1),'subscription',jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/synthetic-owner','keys',jsonb_build_object('p256dh',repeat('C',87),'auth',repeat('D',22)))));
 if result->>'ok' is distinct from 'true' then raise exception 'owner_subscribe';end if;
 result:=public.leader_notifications_command_rpc(manager_id,'subscribe',jsonb_build_object('public_key',(select public_key from leader_private.leader_notification_config where id=1),'subscription',jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/synthetic-manager','keys',jsonb_build_object('p256dh',repeat('C',87),'auth',repeat('D',22)))));
 if result->>'ok' is distinct from 'true' then raise exception 'manager_subscribe';end if;
 insert into public.leader_leads(id,name,status,assigned_to) values('90000000-0000-4000-8000-000000000904','Synthetic notification lead','Новая',manager_id);
 if (select count(*) from leader_private.leader_notification_outbox q join leader_private.leader_notification_events e on e.id=q.event_id where e.lead_id='90000000-0000-4000-8000-000000000904')<>2 then raise exception 'recipient_selection';end if;
 result:=public.leader_notification_worker_rpc('invalid','claim','{}');
 if result->>'error' is distinct from 'invalid_worker' then raise exception 'worker_auth';end if;
 result:=public.leader_notification_worker_rpc(current_setting('leader.test_notification_ticket'),'claim','{}'); batch:=result->'deliveries';
 if result->>'ok' is distinct from 'true' or jsonb_array_length(batch)<>2 then raise exception 'durable_claim';end if;
 result:=public.leader_notification_worker_rpc(current_setting('leader.test_notification_ticket'),'claim','{}');
 if jsonb_array_length(result->'deliveries')<>0 then raise exception 'worker_ticket_replay';end if;
 update public.leader_user_profiles set is_active=false where user_id=owner_id;
 for job in select value from jsonb_array_elements(batch) loop
  prepared:=public.leader_notification_worker_rpc(current_setting('leader.test_notification_ticket'),'prepare',job);
  if prepared->>'state'='cancelled' then continue;end if;
  if prepared->'delivery'->'payload'->>'actor_id' is distinct from manager_id::text then raise exception 'fresh_actor_recheck';end if;
  if prepared->'delivery'->'payload' ? 'phone' or prepared->'delivery'->'payload' ? 'name' then raise exception 'private_lock_screen_data';end if;
  result:=public.leader_notification_worker_rpc(current_setting('leader.test_notification_ticket'),'finish',job||jsonb_build_object('status',410));
  if result->>'state' is distinct from 'cancelled' then raise exception 'expired_subscription_not_removed';end if;
  result:=public.leader_notification_worker_rpc(current_setting('leader.test_notification_ticket'),'finish',job||jsonb_build_object('status',201));
  if result->>'state' is distinct from 'ignored' then raise exception 'stale_finish_applied';end if;
 end loop;
 if exists(select 1 from leader_private.leader_push_subscriptions where user_id=manager_id and active) then raise exception 'dead_device_active';end if;
end $$;
reset role;
rollback;
select jsonb_build_object('notification_rpc_proof',true,'fixture_profiles',(select count(*) from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-0000000009%'));
