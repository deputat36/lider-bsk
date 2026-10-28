-- Opt-in delivery only: no subscriptions or historical event backfill are created.
-- User authorized completion on 28.10.2026. Edge must be deployed/read back first.
begin;
do $$ begin
 if to_regprocedure('public.leader_notification_worker_rpc(text,text,jsonb)') is null then raise exception 'notification_worker_missing'; end if;
 if exists(select from leader_private.leader_push_subscriptions where active) then raise exception 'review_existing_subscribers_before_initial_activation'; end if;
end $$;
update leader_private.leader_notification_config set dispatch_url='https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-crm-notifications', enabled=true where id=1;
commit;
