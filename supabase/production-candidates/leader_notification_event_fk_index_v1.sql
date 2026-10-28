-- Cover the remaining FK in the new opt-in notification queue.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create index if not exists leader_notification_events_test_subscription_idx
 on leader_private.leader_notification_events(test_subscription_id);
commit;
