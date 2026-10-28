-- Scoped, additive package. Starts disabled; no historical lead backfill.
-- Apply only this migration, never an unreviewed db push of historical files.
begin;
do $$ begin
  if to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null then
    raise exception 'canonical_leader_rbac_required';
  end if;
end $$;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table leader_private.leader_notification_config (
  id integer primary key check (id=1),
  enabled boolean not null default false,
  public_key text,
  private_key text,
  worker_secret text not null default encode(extensions.gen_random_bytes(32),'hex'),
  dispatch_url text check (dispatch_url in (
    'https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-crm-notifications',
    'https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-crm-notifications')),
  crm_url text not null default 'https://www.lider-bsk.ru/crm/v4/'
    check (crm_url in ('https://www.lider-bsk.ru/crm/v4/','https://lider-bsk.ru/crm/v4/')),
  reminder_seconds integer not null default 300 check (reminder_seconds between 60 and 3600)
);
insert into leader_private.leader_notification_config(id) values(1);

create table leader_private.leader_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.leader_user_profiles(user_id),
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  label text not null default 'Это устройство',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leader_push_subscriptions_user on leader_private.leader_push_subscriptions(user_id) where active;

create table leader_private.leader_notification_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leader_leads(id) on delete cascade,
  kind text not null check(kind in ('new','reminder','test')),
  test_actor_id uuid,
  test_subscription_id uuid references leader_private.leader_push_subscriptions(id),
  request_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(lead_id,kind),
  unique(test_actor_id,request_id),
  check ((kind='test' and lead_id is null and test_actor_id is not null and test_subscription_id is not null and request_id is not null)
    or (kind in ('new','reminder') and lead_id is not null and test_actor_id is null and test_subscription_id is null and request_id is null))
);
create index leader_notification_events_unresolved on leader_private.leader_notification_events(created_at) where kind='new' and resolved_at is null;

create table leader_private.leader_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references leader_private.leader_notification_events(id) on delete cascade,
  subscription_id uuid not null references leader_private.leader_push_subscriptions(id),
  state text not null default 'pending' check(state in ('pending','sending','sent','cancelled','failed','expired')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease uuid,
  lease_until timestamptz,
  accepted_at timestamptz,
  last_status integer,
  last_error text,
  unique(event_id,subscription_id)
);
create index leader_notification_outbox_due on leader_private.leader_notification_outbox(next_attempt_at) where state in ('pending','sending');
create index leader_notification_outbox_subscription on leader_private.leader_notification_outbox(subscription_id);

alter table leader_private.leader_notification_config enable row level security;
alter table leader_private.leader_push_subscriptions enable row level security;
alter table leader_private.leader_notification_events enable row level security;
alter table leader_private.leader_notification_outbox enable row level security;
create policy leader_notifications_service_only on leader_private.leader_notification_config to service_role using(true) with check(true);
create policy leader_notifications_service_only on leader_private.leader_push_subscriptions to service_role using(true) with check(true);
create policy leader_notifications_service_only on leader_private.leader_notification_events to service_role using(true) with check(true);
create policy leader_notifications_service_only on leader_private.leader_notification_outbox to service_role using(true) with check(true);
revoke all on leader_private.leader_notification_config,leader_private.leader_push_subscriptions,
  leader_private.leader_notification_events,leader_private.leader_notification_outbox from public,anon,authenticated;
grant usage on schema leader_private to service_role;
grant select,insert,update on leader_private.leader_notification_config,leader_private.leader_push_subscriptions,
  leader_private.leader_notification_events,leader_private.leader_notification_outbox to service_role;

create function leader_private.leader_notification_actor_allowed(p_actor uuid,p_lead uuid default null)
returns boolean language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.leader_user_profiles p
    where p.user_id=p_actor and p.is_active and p.role in ('owner','admin','manager')
      and leader_private.leader_actor_has_crm_action(p_actor,'leads.read')
      and (p_lead is null or exists(select 1 from public.leader_leads l where l.id=p_lead
        and (p.role in ('owner','admin') or l.assigned_to is null or l.assigned_to=p_actor))));
$$;

create function leader_private.leader_notification_wake()
returns void language plpgsql security definer set search_path='' as $$
declare c leader_private.leader_notification_config;
begin
  select * into c from leader_private.leader_notification_config where id=1;
  if not c.enabled or c.dispatch_url is null then return; end if;
  if not exists(select 1 from leader_private.leader_notification_outbox
    where state='pending' and next_attempt_at<=now()) then return; end if;
  -- pg_net sends only after commit. Its unlogged queue is NOT the durable outbox.
  perform net.http_post(url:=c.dispatch_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-leader-notification-worker',c.worker_secret),
    body:='{"action":"dispatch"}'::jsonb,timeout_milliseconds:=45000);
exception when others then
  -- A failed wakeup must not roll back a saved lead. Cron retries the durable row.
  raise warning 'leader_notification_wakeup_failed';
end $$;

create function leader_private.leader_notification_enqueue()
returns trigger language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
  insert into leader_private.leader_notification_outbox(event_id,subscription_id)
    select new.id,s.id from leader_private.leader_push_subscriptions s
    where s.active and leader_private.leader_notification_actor_allowed(s.user_id,new.lead_id)
      and (new.kind<>'test' or (s.id=new.test_subscription_id and s.user_id=new.test_actor_id))
    on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted>0 then perform leader_private.leader_notification_wake(); end if;
  return new;
end $$;
create trigger leader_notification_event_enqueue after insert on leader_private.leader_notification_events
for each row execute function leader_private.leader_notification_enqueue();

create function leader_private.leader_notification_capture_lead()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.status='Новая' and (select enabled from leader_private.leader_notification_config where id=1) then
      insert into leader_private.leader_notification_events(lead_id,kind) values(new.id,'new') on conflict do nothing;
    end if;
  elsif (new.status is distinct from old.status or new.assigned_to is distinct from old.assigned_to)
    and (new.status<>'Новая' or new.assigned_to is not null) then
    update leader_private.leader_notification_events set resolved_at=now() where lead_id=new.id and resolved_at is null;
    update leader_private.leader_notification_outbox q set state='cancelled',lease=null,lease_until=null,last_error='lead_accepted'
    from leader_private.leader_notification_events e where q.event_id=e.id and e.lead_id=new.id and q.state in ('pending','sending');
  end if;
  return new;
end $$;
create trigger leader_notification_lead_insert after insert on public.leader_leads
for each row execute function leader_private.leader_notification_capture_lead();
create trigger leader_notification_lead_accept after update of status,assigned_to on public.leader_leads
for each row execute function leader_private.leader_notification_capture_lead();

create function leader_private.leader_notification_tick()
returns void language plpgsql security definer set search_path='' as $$
declare r record; delay_seconds integer;
begin
  select reminder_seconds into delay_seconds from leader_private.leader_notification_config where id=1 and enabled;
  if not found then return; end if;
  -- Lead first, then event/outbox: same lock order as the acceptance trigger.
  for r in select l.id from public.leader_leads l join leader_private.leader_notification_events e
    on e.lead_id=l.id and e.kind='new'
    where e.resolved_at is null and e.created_at<=now()-make_interval(secs=>delay_seconds)
      and e.created_at>now()-interval '24 hours' and l.status='Новая' and l.assigned_to is null
      and not exists(select 1 from leader_private.leader_notification_events other where other.lead_id=l.id and other.kind='reminder')
    limit 100 for update of l skip locked
  loop
    insert into leader_private.leader_notification_events(lead_id,kind) values(r.id,'reminder') on conflict do nothing;
  end loop;
  update leader_private.leader_notification_outbox q set state='expired',lease=null,lease_until=null,last_error='expired'
    from leader_private.leader_notification_events e where e.id=q.event_id and e.created_at<now()-interval '24 hours'
      and q.state in ('pending','sending');
  update leader_private.leader_notification_outbox set state='pending',lease=null,lease_until=null
    where state='sending' and lease_until<now() and attempts<6;
  update leader_private.leader_notification_outbox set state='failed',last_error='attempts_exhausted',lease=null,lease_until=null
    where state='sending' and lease_until<now() and attempts>=6;
  perform leader_private.leader_notification_wake();
end $$;

create function public.leader_notifications_command_rpc(p_actor_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c leader_private.leader_notification_config; s leader_private.leader_push_subscriptions;
  sub jsonb; endpoint_value text; event_id uuid; response jsonb;
begin
  if not leader_private.leader_notification_actor_allowed(p_actor_id) then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;
  select * into c from leader_private.leader_notification_config where id=1;
  if p_action='keys.ensure' then
    if coalesce(length(p_data->>'publicKey'),0)<>87 or coalesce(length(p_data->>'privateKey'),0)<>43
      or (p_data->>'publicKey')!~'^[A-Za-z0-9_-]+$' or (p_data->>'privateKey')!~'^[A-Za-z0-9_-]+$' then
      return jsonb_build_object('ok',false,'error','invalid_payload');
    end if;
    update leader_private.leader_notification_config set public_key=p_data->>'publicKey',private_key=p_data->>'privateKey'
      where id=1 and public_key is null;
    return jsonb_build_object('ok',true);
  elsif p_action='status' then
    select jsonb_build_object('ok',true,'enabled',c.enabled and c.dispatch_url is not null,'public_key',c.public_key,
      'reminder_seconds',c.reminder_seconds,
      'devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'active',active,'updated_at',updated_at))
        from leader_private.leader_push_subscriptions where user_id=p_actor_id and active),'[]'::jsonb),
      'device_id',(select id from leader_private.leader_push_subscriptions where user_id=p_actor_id and active and endpoint=p_data->>'endpoint'),
      'failed_count',(select count(*) from leader_private.leader_notification_outbox q join leader_private.leader_push_subscriptions s
        on s.id=q.subscription_id where s.user_id=p_actor_id and q.state='failed')) into response;
    return response;
  elsif p_action='unsubscribe' then
    update leader_private.leader_push_subscriptions set active=false,updated_at=now() where id=(p_data->>'id')::uuid and user_id=p_actor_id returning * into s;
    if found then
      update leader_private.leader_notification_outbox set state='cancelled',lease=null,lease_until=null,last_error='unsubscribed'
        where subscription_id=s.id and state in ('pending','sending');
    end if;
    return jsonb_build_object('ok',true);
  end if;
  if not c.enabled or c.dispatch_url is null then return jsonb_build_object('ok',false,'error','disabled'); end if;
  if p_action='subscribe' then
    sub:=p_data->'subscription'; endpoint_value:=sub->>'endpoint';
    if endpoint_value is null or length(endpoint_value)>4096
      or endpoint_value!~'^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/[^[:space:]#@]+$'
      or coalesce(length(sub#>>'{keys,p256dh}'),0)<>87 or coalesce(length(sub#>>'{keys,auth}'),0)<>22 then
      return jsonb_build_object('ok',false,'error','invalid_subscription');
    end if;
    if c.public_key is null or coalesce(p_data->>'public_key','')<>c.public_key then return jsonb_build_object('ok',false,'error','key_changed'); end if;
    -- Serialise the per-user device limit and endpoint ownership decision.
    perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text,261026));
    select * into s from leader_private.leader_push_subscriptions where endpoint=endpoint_value for update;
    if found and s.user_id<>p_actor_id then return jsonb_build_object('ok',false,'error','device_owner_conflict'); end if;
    if (s.id is null or not s.active) and (select count(*) from leader_private.leader_push_subscriptions where user_id=p_actor_id and active)>=10 then
      return jsonb_build_object('ok',false,'error','device_limit');
    end if;
    insert into leader_private.leader_push_subscriptions(user_id,endpoint,p256dh,auth_key,label)
      values(p_actor_id,endpoint_value,sub#>>'{keys,p256dh}',sub#>>'{keys,auth}',left(coalesce(nullif(p_data->>'label',''),'Это устройство'),80))
      on conflict(endpoint) do update set active=true,p256dh=excluded.p256dh,auth_key=excluded.auth_key,label=excluded.label,updated_at=now()
      where leader_private.leader_push_subscriptions.user_id=p_actor_id returning * into s;
    if s.id is null then return jsonb_build_object('ok',false,'error','device_owner_conflict'); end if;
    return jsonb_build_object('ok',true,'id',s.id);
  elsif p_action='test' then
    perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text,261026));
    select id into event_id from leader_private.leader_notification_events where test_actor_id=p_actor_id and request_id=(p_data->>'request_id')::uuid;
    if found then return jsonb_build_object('ok',true,'queued',true,'replay',true); end if;
    select * into s from leader_private.leader_push_subscriptions where id=(p_data->>'id')::uuid and user_id=p_actor_id and active;
    if not found then return jsonb_build_object('ok',false,'error','device_not_found'); end if;
    if exists(select 1 from leader_private.leader_notification_events where test_actor_id=p_actor_id and created_at>now()-interval '1 minute') then
      return jsonb_build_object('ok',false,'error','rate_limited');
    end if;
    insert into leader_private.leader_notification_events(kind,test_actor_id,test_subscription_id,request_id)
      values('test',p_actor_id,s.id,(p_data->>'request_id')::uuid);
    return jsonb_build_object('ok',true,'queued',true);
  end if;
  return jsonb_build_object('ok',false,'error','invalid_action');
exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','invalid_payload');
end $$;

create function public.leader_notification_worker_rpc(p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c leader_private.leader_notification_config; q leader_private.leader_notification_outbox;
  e leader_private.leader_notification_events; s leader_private.leader_push_subscriptions;
  payload jsonb; batch jsonb; result_state text; http_status integer; retry_seconds integer;
begin
  select * into c from leader_private.leader_notification_config where id=1;
  if c.id is null or p_token is null or length(p_token)<>64 or extensions.digest(p_token,'sha256')<>extensions.digest(c.worker_secret,'sha256') then
    return jsonb_build_object('ok',false,'error','invalid_worker');
  end if;
  if not c.enabled then return jsonb_build_object('ok',true,'deliveries','[]'::jsonb); end if;
  if p_action='claim' then
    with picked as (select id from leader_private.leader_notification_outbox where state='pending' and next_attempt_at<=now()
      and attempts<6 order by next_attempt_at,id limit 8 for update skip locked),
    claimed as (update leader_private.leader_notification_outbox q set state='sending',attempts=attempts+1,
      lease=gen_random_uuid(),lease_until=now()+interval '60 seconds' from picked where q.id=picked.id returning q.id,q.lease)
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease)),'[]'::jsonb) into batch from claimed;
    return jsonb_build_object('ok',true,'deliveries',batch);
  elsif p_action='continue' then
    perform leader_private.leader_notification_wake(); return jsonb_build_object('ok',true);
  end if;
  select * into q from leader_private.leader_notification_outbox where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid
    and state='sending' and lease_until>now() for update;
  if not found then return jsonb_build_object('ok',true,'state','ignored'); end if;
  if p_action='prepare' then
    select * into e from leader_private.leader_notification_events where id=q.event_id;
    select * into s from leader_private.leader_push_subscriptions where id=q.subscription_id;
    if not s.active or not leader_private.leader_notification_actor_allowed(s.user_id,e.lead_id)
      or e.resolved_at is not null or e.created_at<now()-interval '24 hours'
      or (e.kind<>'test' and not exists(select 1 from public.leader_leads where id=e.lead_id and status='Новая')) then
      update leader_private.leader_notification_outbox set state='cancelled',lease=null,lease_until=null,last_error='no_longer_eligible' where id=q.id;
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
      update leader_private.leader_push_subscriptions set active=false,updated_at=now() where id=q.subscription_id;
    elsif (http_status=0 or http_status in (408,425,429) or http_status>=500) and q.attempts<6 then
      result_state:='pending';
    else result_state:='failed'; end if;
    retry_seconds:=greatest(least(coalesce((p_data->>'retry_after')::integer,0),3600),least(3600,30*(2^q.attempts)::integer));
    update leader_private.leader_notification_outbox set state=result_state,lease=null,lease_until=null,
      last_status=http_status,accepted_at=case when result_state='sent' then now() else accepted_at end,
      next_attempt_at=now()+make_interval(secs=>retry_seconds),
      last_error=case when result_state='sent' then null when http_status=0 then 'network_or_timeout' else 'push_http_'||http_status::text end where id=q.id;
    return jsonb_build_object('ok',true,'state',result_state);
  end if;
  return jsonb_build_object('ok',false,'error','invalid_action');
exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','invalid_payload');
end $$;

revoke all on function leader_private.leader_notification_actor_allowed(uuid,uuid),
  leader_private.leader_notification_wake(),leader_private.leader_notification_enqueue(),
  leader_private.leader_notification_capture_lead(),leader_private.leader_notification_tick(),
  public.leader_notifications_command_rpc(uuid,text,jsonb),public.leader_notification_worker_rpc(text,text,jsonb)
  from public,anon,authenticated;
grant execute on function leader_private.leader_notification_actor_allowed(uuid,uuid),leader_private.leader_notification_wake(),
  public.leader_notifications_command_rpc(uuid,text,jsonb),public.leader_notification_worker_rpc(text,text,jsonb) to service_role;

-- Disabled config makes this new, dedicated job a no-op until scoped activation.
select cron.schedule('leader-notifications-retry-v1','* * * * *','select leader_private.leader_notification_tick();');
comment on table leader_private.leader_notification_outbox is 'Push-service acceptance only. sent does not mean device delivery or human acknowledgement.';
commit;


