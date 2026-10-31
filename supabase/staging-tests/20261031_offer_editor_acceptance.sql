-- Synthetic fixtures only. Run inside a transaction; the caller rolls it back.
-- This acceptance is also used by the isolated PostgreSQL CI harness.
do $fixtures$
begin
  if current_database()<>'leader_offer_editor_test' then raise exception 'isolated_test_database_required'; end if;
end
$fixtures$;
insert into public.leader_user_profiles(user_id,role,is_active) values('a6020000-0000-4000-8000-000000000001','manager',true);
insert into public.leader_leads(id) values('a6020000-0000-4000-8000-000000000002');
insert into public.leader_lead_calculations(id,lead_id,is_current_revision) values('a6020000-0000-4000-8000-000000000003','a6020000-0000-4000-8000-000000000002',true);
insert into public.leader_commercial_offers(id,lead_id,calculation_id,title,short_text,full_text,total_sum,valid_until,status,updated_at)
values('a6020000-0000-4000-8000-000000000004','a6020000-0000-4000-8000-000000000002','a6020000-0000-4000-8000-000000000003','Исходное КП','Короткое','Полное',1700,'2026-11-05','Черновик','2026-10-31T00:00:00.123456Z');
set local role service_role;
do $acceptance$
declare
  actor uuid := 'a6020000-0000-4000-8000-000000000001';
  oid uuid := 'a6020000-0000-4000-8000-000000000004';
  cmd jsonb; original jsonb; changed jsonb; r jsonb; replay jsonb;
  current_stamp timestamptz; first_stamp timestamptz; before_row jsonb;
  n integer; receipt_n integer; role_name text;
begin
  select updated_at into first_stamp from public.leader_commercial_offers where id=oid;
  cmd := jsonb_build_object('action','offer.update','request_id',gen_random_uuid(),'expected_updated_at',first_stamp,
    'payload',jsonb_build_object('offer_id',oid,'idempotency_key','SYNTH-OFFER-602-first','patch',
      jsonb_build_object('title','Новое КП','short_text','Новые краткие условия','full_text',repeat('Текст без усечения. ',200),'valid_until','2026-11-06')));
  original:=cmd;
  r := public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'actor_email','synthetic@example.invalid','request',cmd));
  if r->>'ok' is distinct from 'true' or r->'offer'->>'title'<>'Новое КП' or r->'offer'->>'full_text'<>repeat('Текст без усечения. ',200)
     or (r->'offer'->>'total_sum')::numeric<>1700 or r->'offer'->>'status'<>'Черновик' then raise exception 'positive_edit_failed %',r; end if;
  select updated_at,to_jsonb(o) into current_stamp,before_row from public.leader_commercial_offers o where id=oid;
  replay := public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
  if replay->>'idempotent_replay' is distinct from 'true' or replay->'offer' is distinct from r->'offer' then raise exception 'exact_replay_failed %',replay; end if;
  select count(*) into n from public.leader_commercial_offer_events where offer_id=oid;
  select count(*) into receipt_n from leader_private.leader_command_receipts where action='offer.update';
  if n<>1 or receipt_n<>1 then raise exception 'replay_created_duplicate'; end if;
  changed := jsonb_set(cmd,'{payload,patch,title}','"Изменённый повтор"');
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',changed));
  if r->'error'->>'code' is distinct from 'conflict' then raise exception 'changed_replay_accepted %',r; end if;
  changed:=jsonb_set(cmd,'{payload,idempotency_key}','"SYNTH-OFFER-602-request-id-collision"');
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',changed));
  if r->'error'->>'code' is distinct from 'conflict' then raise exception 'request_id_collision_accepted %',r; end if;
  cmd:=jsonb_set(jsonb_set(cmd,'{request_id}',to_jsonb(gen_random_uuid())),'{payload,idempotency_key}','"SYNTH-OFFER-602-stale"');
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
  if r->'error'->>'code' is distinct from 'conflict' then raise exception 'stale_edit_accepted %',r; end if;
  cmd:=jsonb_set(cmd,'{expected_updated_at}',to_jsonb(current_stamp));
  changed:=jsonb_set(cmd,'{payload,patch,total_sum}','1');
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',changed));
  if r->'error'->>'code' is distinct from 'validation_error' then raise exception 'financial_patch_accepted %',r; end if;
  changed:=jsonb_set(cmd,'{actor_id}',to_jsonb(actor));
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',changed));
  if r->'error'->>'code' is distinct from 'validation_error' then raise exception 'actor_envelope_field_accepted %',r; end if;
  changed:=jsonb_set(cmd,'{payload,patch,valid_until}','"2026-02-30"');
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',changed));
  if r->'error'->>'code' is distinct from 'validation_error' then raise exception 'invalid_date_accepted %',r; end if;
  changed:=jsonb_set(cmd,'{payload,patch,short_text}',to_jsonb(repeat('я',4001)));
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',changed));
  if r->'error'->>'code' is distinct from 'validation_error' then raise exception 'overlong_text_truncated_or_accepted %',r; end if;
  foreach role_name in array array['accountant','designer','installer','contractor','unknown'] loop
    update public.leader_user_profiles set role=role_name where user_id=actor;
    r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
    if r->'error'->>'code' is distinct from 'forbidden' then raise exception 'restricted_role_accepted % %',role_name,r; end if;
  end loop;
  update public.leader_user_profiles set role='owner',is_active=false where user_id=actor;
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
  if r->'error'->>'code' is distinct from 'forbidden' then raise exception 'inactive_profile_accepted %',r; end if;
  update public.leader_user_profiles set is_active=true where user_id=actor;
  foreach role_name in array array['owner','admin'] loop
    update public.leader_user_profiles set role=role_name where user_id=actor;
    cmd:=jsonb_set(jsonb_set(jsonb_set(cmd,'{request_id}',to_jsonb(gen_random_uuid())),'{expected_updated_at}',to_jsonb(current_stamp)),'{payload,idempotency_key}',to_jsonb('SYNTH-OFFER-602-positive-'||role_name));
    r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
    if r->>'ok' is distinct from 'true' then raise exception 'office_role_denied % %',role_name,r; end if;
    select updated_at into current_stamp from public.leader_commercial_offers where id=oid;
  end loop;
  -- Atomicity: a failed event append must undo the edit and leave no receipt.
  select to_jsonb(o) into before_row from public.leader_commercial_offers o where id=oid;
  cmd:=jsonb_set(jsonb_set(jsonb_set(cmd,'{request_id}',to_jsonb(gen_random_uuid())),'{expected_updated_at}',to_jsonb(current_stamp)),'{payload,idempotency_key}','"SYNTH-OFFER-602-atomic"');
  changed:=jsonb_set(cmd,'{payload,patch,title}','"Не должно сохраниться"');
  perform set_config('leader.test_event_failure','on',true);
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',changed));
  perform set_config('leader.test_event_failure','off',true);
  if r->'error'->>'code' is distinct from 'persistence_failed'
     or before_row is distinct from (select to_jsonb(o) from public.leader_commercial_offers o where id=oid)
     or exists(select 1 from leader_private.leader_command_receipts where idempotency_key='SYNTH-OFFER-602-atomic') then raise exception 'failed_event_left_partial_write %',r; end if;
  update public.leader_lead_calculations set is_current_revision=false where id='a6020000-0000-4000-8000-000000000003';
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
  if r->'error'->>'code' is distinct from 'source_not_current' then raise exception 'historical_source_accepted %',r; end if;
  update public.leader_lead_calculations set is_current_revision=true where id='a6020000-0000-4000-8000-000000000003';
  update public.leader_leads set converted_order_id=gen_random_uuid() where id='a6020000-0000-4000-8000-000000000002';
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
  if r->'error'->>'code' is distinct from 'order_already_created' then raise exception 'linked_order_edit_accepted %',r; end if;
  update public.leader_leads set converted_order_id=null where id='a6020000-0000-4000-8000-000000000002';
  update public.leader_commercial_offers set status='Согласовано',approved_at=clock_timestamp() where id=oid;
  r:=public.leader_update_offer_rpc(jsonb_build_object('actor_id',actor,'request',cmd));
  if r->'error'->>'code' is distinct from 'offer_not_editable' then raise exception 'approved_edit_accepted %',r; end if;
  begin
    update public.leader_commercial_offers set full_text='Переписанное согласованное КП' where id=oid;
    raise exception 'approved_content_directly_mutable';
  exception when check_violation then null; end;
  -- Reverting the status alone must not unfreeze a previously approved snapshot.
  update public.leader_commercial_offers set status='Черновик' where id=oid;
  begin
    update public.leader_commercial_offers set title='Обход после смены статуса' where id=oid;
    raise exception 'previously_approved_content_mutable';
  exception when check_violation then null; end;
  update public.leader_commercial_offers set status='Согласовано' where id=oid;
  -- Existing order conversion/status flows may still link the preserved snapshot.
  update public.leader_commercial_offers set order_id=gen_random_uuid(),updated_at=clock_timestamp() where id=oid;
  if (select total_sum from public.leader_commercial_offers where id=oid)<>1700 then raise exception 'snapshot_total_changed'; end if;
end
$acceptance$;
reset role;
-- Browser RLS is exercised against the production-style legacy permissive ALL
-- policy. No INSERT grant is introduced into an actual staging environment.
insert into public.leader_user_profiles(user_id,role,is_active) values
('a6020000-0000-4000-8000-000000000011','owner',true),
('a6020000-0000-4000-8000-000000000012','admin',true),
('a6020000-0000-4000-8000-000000000013','manager',true),
('a6020000-0000-4000-8000-000000000014','accountant',true),
('a6020000-0000-4000-8000-000000000015','designer',true),
('a6020000-0000-4000-8000-000000000016','installer',true),
('a6020000-0000-4000-8000-000000000017','contractor',true),
('a6020000-0000-4000-8000-000000000018','owner',false);
set local "request.jwt.claim.role"='authenticated';
set local role authenticated;
do $browser_roles$
declare actor uuid; role_name text; n int; inserted public.leader_commercial_offers%rowtype;
begin
  for actor,role_name in select x.actor::uuid,x.role_name from (values
    ('a6020000-0000-4000-8000-000000000011','owner'),
    ('a6020000-0000-4000-8000-000000000012','admin'),
    ('a6020000-0000-4000-8000-000000000013','manager'),
    ('a6020000-0000-4000-8000-000000000014','accountant'),
    ('a6020000-0000-4000-8000-000000000015','designer'),
    ('a6020000-0000-4000-8000-000000000016','installer'),
    ('a6020000-0000-4000-8000-000000000017','contractor'),
    ('a6020000-0000-4000-8000-000000000018','inactive')) as x(actor,role_name)
  loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    select count(*) into n from public.leader_commercial_offers;
    if role_name in ('owner','admin','manager') then
      if n=0 then raise exception 'office_read_denied %',role_name; end if;
      -- Cached createOffer does not send actor fields; DB binds them safely.
      insert into public.leader_commercial_offers(id,lead_id,calculation_id,title,short_text,full_text,total_sum,valid_until,status,updated_at)
        values(gen_random_uuid(),'a6020000-0000-4000-8000-000000000002','a6020000-0000-4000-8000-000000000003',
          'SYNTH cached browser','Короткое','Полное',1700,'2026-11-05','Черновик',clock_timestamp()) returning * into inserted;
      if inserted.created_by is distinct from actor or inserted.updated_by is distinct from actor then raise exception 'cached_browser_actor_not_bound'; end if;
      begin
        insert into public.leader_commercial_offers(id,title,status,created_by)
          values(gen_random_uuid(),'SYNTH spoof','Черновик','a6020000-0000-4000-8000-000000000001');
        raise exception 'browser_actor_spoof_accepted';
      exception when check_violation then null; end;
      begin
        insert into public.leader_commercial_offers(id,title,status,created_by,updated_by)
          values(gen_random_uuid(),'SYNTH updater spoof','Черновик',actor,'a6020000-0000-4000-8000-000000000001');
        raise exception 'browser_updater_spoof_accepted';
      exception when check_violation then null; end;
      begin
        insert into public.leader_commercial_offers(id,title,status) values(gen_random_uuid(),'SYNTH fake approval','Согласовано');
        raise exception 'browser_inserted_approval';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.leader_commercial_offers(id,title,status,approved_at)
          values(gen_random_uuid(),'SYNTH hidden approval','Черновик',clock_timestamp());
        raise exception 'browser_inserted_approved_draft';
      exception when insufficient_privilege then null; end;
    else
      if n<>0 then raise exception 'restricted_browser_read_open %',role_name; end if;
      begin
        insert into public.leader_commercial_offers(id,title,status) values(gen_random_uuid(),'SYNTH restricted','Черновик');
        raise exception 'restricted_browser_insert_open %',role_name;
      exception when insufficient_privilege then null; end;
    end if;
  end loop;
end
$browser_roles$;
do $browser_denials$
begin
  begin
    update public.leader_commercial_offers set title='Browser bypass';
    raise exception 'browser_update_open';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.leader_commercial_offers;
    raise exception 'browser_delete_open';
  exception when insufficient_privilege then null; end;
  begin
    perform public.leader_update_offer_rpc('{}'::jsonb);
    raise exception 'browser_service_rpc_open';
  exception when insufficient_privilege then null; end;
  if not has_table_privilege(current_user,'public.leader_commercial_offers','SELECT')
     or not has_table_privilege(current_user,'public.leader_commercial_offers','INSERT') then
    raise exception 'existing_browser_read_or_create_contract_removed';
  end if;
  if has_table_privilege(current_user,'public.leader_commercial_offers','TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege(current_user,'public.leader_commercial_offers','REFERENCES') then
    raise exception 'browser_non_application_privileges_open';
  end if;
end
$browser_denials$;
reset role;
set local role anon;
do $anonymous_denials$
begin
  if has_table_privilege(current_user,'public.leader_commercial_offers','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     or has_any_column_privilege(current_user,'public.leader_commercial_offers','SELECT,INSERT,UPDATE,REFERENCES') then
    raise exception 'anonymous_offer_privilege_open';
  end if;
end
$anonymous_denials$;
reset role;
select 'Offer editor actual migration: office allow, restricted read/insert deny, cached actor binding, full text, CAS, replay, atomic event, immutable approved snapshot and browser privilege denial PASS' as result;
