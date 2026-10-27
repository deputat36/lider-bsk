begin;
create or replace function public.leader_notifications_command_rpc(p_actor_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c leader_private.leader_notification_config; v_sub leader_private.leader_push_subscriptions;
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
    update leader_private.leader_push_subscriptions set active=false,updated_at=now() where id=(p_data->>'id')::uuid and user_id=p_actor_id returning * into v_sub;
    if found then
      update leader_private.leader_notification_outbox set state='cancelled',lease=null,lease_until=null,last_error='unsubscribed'
        where subscription_id=v_sub.id and state in ('pending','sending');
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
    select * into v_sub from leader_private.leader_push_subscriptions where endpoint=endpoint_value for update;
    if found and v_sub.user_id<>p_actor_id then return jsonb_build_object('ok',false,'error','device_owner_conflict'); end if;
    if (v_sub.id is null or not v_sub.active) and (select count(*) from leader_private.leader_push_subscriptions where user_id=p_actor_id and active)>=10 then
      return jsonb_build_object('ok',false,'error','device_limit');
    end if;
    insert into leader_private.leader_push_subscriptions(user_id,endpoint,p256dh,auth_key,label)
      values(p_actor_id,endpoint_value,sub#>>'{keys,p256dh}',sub#>>'{keys,auth}',left(coalesce(nullif(p_data->>'label',''),'Это устройство'),80))
      on conflict(endpoint) do update set active=true,p256dh=excluded.p256dh,auth_key=excluded.auth_key,label=excluded.label,updated_at=now()
      where leader_private.leader_push_subscriptions.user_id=p_actor_id returning * into v_sub;
    if v_sub.id is null then return jsonb_build_object('ok',false,'error','device_owner_conflict'); end if;
    return jsonb_build_object('ok',true,'id',v_sub.id);
  elsif p_action='test' then
    perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text,261026));
    select id into event_id from leader_private.leader_notification_events where test_actor_id=p_actor_id and request_id=(p_data->>'request_id')::uuid;
    if found then return jsonb_build_object('ok',true,'queued',true,'replay',true); end if;
    select * into v_sub from leader_private.leader_push_subscriptions where id=(p_data->>'id')::uuid and user_id=p_actor_id and active;
    if not found then return jsonb_build_object('ok',false,'error','device_not_found'); end if;
    if exists(select 1 from leader_private.leader_notification_events where test_actor_id=p_actor_id and created_at>now()-interval '1 minute') then
      return jsonb_build_object('ok',false,'error','rate_limited');
    end if;
    insert into leader_private.leader_notification_events(kind,test_actor_id,test_subscription_id,request_id)
      values('test',p_actor_id,v_sub.id,(p_data->>'request_id')::uuid);
    return jsonb_build_object('ok',true,'queued',true);
  end if;
  return jsonb_build_object('ok',false,'error','invalid_action');
exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','invalid_payload');
end $$;

create or replace function public.leader_notification_worker_rpc(p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c leader_private.leader_notification_config; v_job leader_private.leader_notification_outbox;
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

commit;

