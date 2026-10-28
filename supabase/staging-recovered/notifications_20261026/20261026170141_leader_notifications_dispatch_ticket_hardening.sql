begin;
create table leader_private.leader_notification_wakeups (
  nonce text primary key,
  expires_at timestamptz not null,
  claimed_at timestamptz
);
alter table leader_private.leader_notification_wakeups enable row level security;
create policy leader_notifications_service_only on leader_private.leader_notification_wakeups to service_role using(true) with check(true);
revoke all on leader_private.leader_notification_wakeups from public,anon,authenticated;
grant select,update on leader_private.leader_notification_wakeups to service_role;

create or replace function leader_private.leader_notification_worker_ticket()
returns text language plpgsql security definer set search_path='' as $$
declare nonce_value text:=encode(extensions.gen_random_bytes(16),'hex');
  expiry bigint:=floor(extract(epoch from now()+interval '2 minutes'));
  secret_value text; message_value text;
begin
  select worker_secret into secret_value from leader_private.leader_notification_config where id=1;
  message_value:=nonce_value||'.'||expiry::text;
  insert into leader_private.leader_notification_wakeups(nonce,expires_at) values(nonce_value,to_timestamp(expiry));
  return message_value||'.'||encode(extensions.hmac(message_value,secret_value,'sha256'),'hex');
end $$;

create or replace function leader_private.leader_notification_wake()
returns void language plpgsql security definer set search_path='' as $$
declare c leader_private.leader_notification_config;
begin
  select * into c from leader_private.leader_notification_config where id=1;
  if not c.enabled or c.dispatch_url is null then return; end if;
  if not exists(select 1 from leader_private.leader_notification_outbox
    where state='pending' and next_attempt_at<=now()) then return; end if;
  -- pg_net sends only after commit. Its unlogged queue is NOT the durable outbox.
  perform net.http_post(url:=c.dispatch_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-leader-notification-worker',leader_private.leader_notification_worker_ticket()),
    body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=45000);
exception when others then
  -- A failed wakeup must not roll back a saved lead. Cron retries the durable row.
  raise warning 'leader_notification_wakeup_failed';
end $$;

create or replace function public.leader_notification_worker_rpc(p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c leader_private.leader_notification_config; v_job leader_private.leader_notification_outbox;
  e leader_private.leader_notification_events; s leader_private.leader_push_subscriptions;
  payload jsonb; batch jsonb; result_state text; http_status integer; retry_seconds integer;
  ticket_nonce text; ticket_expiry bigint; ticket_message text;
begin
  select * into c from leader_private.leader_notification_config where id=1;
  if c.id is null or p_token is null or p_token!~'^[0-9a-f]{32}[.][0-9]{10}[.][0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','invalid_worker');
  end if;
  ticket_nonce:=split_part(p_token,'.',1); ticket_expiry:=split_part(p_token,'.',2)::bigint;
  ticket_message:=ticket_nonce||'.'||ticket_expiry::text;
  if ticket_expiry<extract(epoch from now()) or ticket_expiry>extract(epoch from now()+interval '150 seconds')
    or split_part(p_token,'.',3)<>encode(extensions.hmac(ticket_message,c.worker_secret,'sha256'),'hex')
    or not exists(select 1 from leader_private.leader_notification_wakeups where nonce=ticket_nonce and expires_at=to_timestamp(ticket_expiry)) then
    return jsonb_build_object('ok',false,'error','invalid_worker');
  end if;
  if not c.enabled then return jsonb_build_object('ok',true,'deliveries','[]'::jsonb); end if;
  if p_action='claim' then
    update leader_private.leader_notification_wakeups set claimed_at=now() where nonce=ticket_nonce and claimed_at is null;
    if not found then return jsonb_build_object('ok',true,'deliveries','[]'::jsonb); end if;
    with picked as (select id from leader_private.leader_notification_outbox where state='pending' and next_attempt_at<=now()
      and attempts<6 order by next_attempt_at,id limit 8 for update skip locked),
    claimed as (update leader_private.leader_notification_outbox q set state='sending',attempts=attempts+1,
      lease=gen_random_uuid(),lease_until=now()+interval '60 seconds' from picked where q.id=picked.id returning q.id,q.lease)
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease)),'[]'::jsonb) into batch from claimed;
    return jsonb_build_object('ok',true,'deliveries',batch);
  elsif not exists(select 1 from leader_private.leader_notification_wakeups where nonce=ticket_nonce and claimed_at is not null) then
    return jsonb_build_object('ok',false,'error','invalid_worker');
  elsif p_action='continue' then
    perform leader_private.leader_notification_wake(); return jsonb_build_object('ok',true);
  end if;
  select * into v_job from leader_private.leader_notification_outbox where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid
    and state='sending' and lease_until>now() for update;
  if not found then return jsonb_build_object('ok',true,'state','ignored'); end if;
  if p_action='prepare' then
    select * into e from leader_private.leader_notification_events where id=v_job.event_id;
    select * into s from leader_private.leader_push_subscriptions where id=v_job.subscription_id;
    if not s.active or not leader_private.leader_notification_actor_allowed(s.user_id,e.lead_id)
      or e.resolved_at is not null or e.created_at<now()-interval '24 hours'
      or (e.kind<>'test' and not exists(select 1 from public.leader_leads where id=e.lead_id and status='Новая')) then
      update leader_private.leader_notification_outbox set state='cancelled',lease=null,lease_until=null,last_error='no_longer_eligible' where id=v_job.id;
      return jsonb_build_object('ok',true,'state','cancelled');
    end if;
    payload:=jsonb_build_object('v',1,'actor_id',s.user_id,'lead_id',e.lead_id,'kind',e.kind,
      'url',c.crm_url||case when e.lead_id is null then '?notifications=test' else '?tab=leads&lead='||e.lead_id::text end,
      'tag','leader-'||e.id::text,'title',case e.kind when 'test' then 'Лидер — проверка уведомлений'
        when 'reminder' then 'Заявка ещё не принята' else 'Новая заявка в CRM «Лидер»' end,
      'body',case e.kind when 'test' then 'Push работает. Нажмите, чтобы открыть CRM.'
        when 'reminder' then 'Откройте карточку и возьмите обращение в работу.'
        else 'Откройте CRM, чтобы посмотреть обращение.' end);
    return jsonb_build_object('ok',true,'delivery',jsonb_build_object('subscription',jsonb_build_object('endpoint',s.endpoint,
      'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth_key)),
      'keys',jsonb_build_object('publicKey',c.public_key,'privateKey',c.private_key),'payload',payload));
  elsif p_action='finish' then
    http_status:=coalesce((p_data->>'status')::integer,0);
    if http_status between 200 and 299 then
      result_state:='sent';
    elsif http_status in (404,410) then
      result_state:='cancelled';
      update leader_private.leader_push_subscriptions set active=false,updated_at=now() where id=v_job.subscription_id;
    elsif (http_status=0 or http_status in (408,425,429) or http_status>=500) and v_job.attempts<6 then
      result_state:='pending';
    else result_state:='failed'; end if;
    retry_seconds:=greatest(least(coalesce((p_data->>'retry_after')::integer,0),3600),least(3600,30*(2^v_job.attempts)::integer));
    update leader_private.leader_notification_outbox set state=result_state,lease=null,lease_until=null,
      last_status=http_status,accepted_at=case when result_state='sent' then now() else accepted_at end,
      next_attempt_at=now()+make_interval(secs=>retry_seconds),
      last_error=case when result_state='sent' then null when http_status=0 then 'network_or_timeout' else 'push_http_'||http_status::text end where id=v_job.id;
    return jsonb_build_object('ok',true,'state',result_state);
  end if;
  return jsonb_build_object('ok',false,'error','invalid_action');
exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','invalid_payload');
end $$;

revoke all on function leader_private.leader_notification_worker_ticket() from public,anon,authenticated,service_role;
commit;

