-- Scoped Leader package; apply to staging first, then the reviewed production project.
-- Existing offers/calculations/receipts and canonical permissions are prerequisites.
-- No existing business row is changed by this migration.
set local lock_timeout = '5s';
set local statement_timeout = '45s';

do $preflight$
begin
  if to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null
     or to_regprocedure('leader_private.leader_has_crm_action(text)') is null
     or to_regclass('leader_private.leader_command_receipts') is null
     or to_regclass('public.leader_commercial_offer_events') is null
     or not coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.leader_commercial_offers')),false) then
    raise exception 'leader_offer_editor_prerequisite_missing';
  end if;
end
$preflight$;

-- Cached browser bundles may omit actor fields. Bind their new draft to the
-- authenticated session without accepting another user's supplied identity.
-- Service-only RPCs and synthetic seeding retain their explicitly verified actor.
create or replace function leader_private.leader_normalize_offer_actor_v1()
returns trigger language plpgsql security invoker set search_path = '' as $actor$
declare actor uuid;
begin
  if auth.role() = 'authenticated' then
    actor := auth.uid();
    if actor is null or (new.created_by is not null and new.created_by is distinct from actor)
       or (new.updated_by is not null and new.updated_by is distinct from actor) then
      raise exception using errcode='23514', message='offer_actor_mismatch';
    end if;
    new.created_by := actor;
    new.updated_by := actor;
  end if;
  return new;
end
$actor$;
revoke all on function leader_private.leader_normalize_offer_actor_v1() from public,anon,authenticated;
create trigger leader_normalize_offer_actor_v1 before insert on public.leader_commercial_offers
for each row execute function leader_private.leader_normalize_offer_actor_v1();

-- Intersect existing browser grants and permissive policies. Staging does not
-- gain INSERT; production's existing office create path remains available.
create policy leader_offers_canonical_read on public.leader_commercial_offers
as restrictive for select to authenticated
using ((select leader_private.leader_has_crm_action('offers.read')));
create policy leader_offers_canonical_create on public.leader_commercial_offers
as restrictive for insert to authenticated
with check ((select leader_private.leader_has_crm_action('offers.write'))
  and status='Черновик' and created_by=(select auth.uid()) and updated_by=(select auth.uid())
  and sent_at is null and approved_at is null and rejected_at is null and order_id is null);

-- The same content remains available for audit after sending/approval/order creation.
-- Status/updated_at/order_id changes made by the existing operational RPCs still work.
create or replace function leader_private.leader_guard_offer_content_v1()
returns trigger language plpgsql security invoker set search_path = '' as $guard$
begin
  if (old.status is distinct from 'Черновик' or old.order_id is not null
      or old.sent_at is not null or old.approved_at is not null)
     and row(new.title,new.short_text,new.full_text,new.valid_until,new.total_sum,
             new.lead_id,new.calculation_id,new.client_id,new.offer_number,new.offer_type)
         is distinct from
         row(old.title,old.short_text,old.full_text,old.valid_until,old.total_sum,
             old.lead_id,old.calculation_id,old.client_id,old.offer_number,old.offer_type) then
    raise exception using errcode='23514', message='offer_content_immutable';
  end if;
  return new;
end
$guard$;
revoke all on function leader_private.leader_guard_offer_content_v1() from public,anon,authenticated;

create trigger leader_guard_offer_content_v1
before update of title,short_text,full_text,valid_until,total_sum,lead_id,calculation_id,client_id,offer_number,offer_type
on public.leader_commercial_offers
for each row execute function leader_private.leader_guard_offer_content_v1();

create or replace function public.leader_update_offer_rpc(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  actor uuid;
  req jsonb := p_payload -> 'request';
  input jsonb;
  patch jsonb;
  rid uuid;
  expected timestamptz;
  oid uuid;
  key text;
  hash text;
  receipt leader_private.leader_command_receipts%rowtype;
  offer public.leader_commercial_offers%rowtype;
  calculation public.leader_lead_calculations%rowtype;
  lead public.leader_leads%rowtype;
  result jsonb;
  stamp timestamptz := clock_timestamp();
begin
  begin
    actor := nullif(p_payload ->> 'actor_id','')::uuid;
    rid := nullif(req ->> 'request_id','')::uuid;
    expected := nullif(req ->> 'expected_updated_at','')::timestamptz;
    input := req -> 'payload';
    oid := nullif(input ->> 'offer_id','')::uuid;
    patch := input -> 'patch';
  exception when others then
    return jsonb_build_object('ok',false,'error',jsonb_build_object('code','validation_error'));
  end;
  if actor is null or rid is null or expected is null or oid is null
     or req ->> 'action' is distinct from 'offer.update'
     or jsonb_typeof(req) is distinct from 'object'
     or jsonb_typeof(input) is distinct from 'object'
     or jsonb_typeof(patch) is distinct from 'object' then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','validation_error'));
  end if;
  if exists(select 1 from jsonb_object_keys(req) k where k not in ('action','request_id','expected_updated_at','payload'))
     or exists(select 1 from jsonb_object_keys(input) k where k not in ('offer_id','patch','idempotency_key'))
     or exists(select 1 from jsonb_object_keys(patch) k where k not in ('title','short_text','full_text','valid_until'))
     or not (patch ?& array['title','short_text','full_text','valid_until'])
     or exists(select 1 from jsonb_each(patch) p where jsonb_typeof(p.value) <> 'string') then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','validation_error'));
  end if;
  key := btrim(coalesce(input ->> 'idempotency_key',''));
  if char_length(key) not between 1 and 160
     or char_length(btrim(patch ->> 'title')) not between 1 and 500
     or char_length(patch ->> 'short_text') > 4000
     or char_length(patch ->> 'full_text') > 20000
     or (btrim(patch ->> 'short_text')='' and btrim(patch ->> 'full_text')='')
     or patch ->> 'valid_until' !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','validation_error'));
  end if;
  begin
    if to_char((patch ->> 'valid_until')::date,'YYYY-MM-DD') <> patch ->> 'valid_until' then
      return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','validation_error'));
    end if;
  exception when others then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','validation_error'));
  end;
  if not leader_private.leader_actor_has_crm_action(actor,'offers.write') then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','forbidden'));
  end if;
  hash := encode(extensions.digest(convert_to(jsonb_build_object('actor',actor,'action','offer.update','expected',expected,'payload',input)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('offer.update:key:'||key,0));
  perform pg_advisory_xact_lock(hashtextextended('offer.update:request:'||rid::text,0));
  select * into receipt from leader_private.leader_command_receipts
    where action='offer.update' and (idempotency_key=key or request_id=rid) limit 1 for update;
  if found then
    if receipt.actor_id <> actor or receipt.request_hash <> hash
       or receipt.idempotency_key <> key or receipt.request_id <> rid then
      return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','conflict'));
    end if;
    if receipt.state='success' and receipt.response is not null then
      return receipt.response || jsonb_build_object('idempotent_replay',true);
    end if;
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','duplicate_request'));
  end if;
  select * into offer from public.leader_commercial_offers where id=oid for update;
  if not found then return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','not_found')); end if;
  if offer.status is distinct from 'Черновик' or offer.approved_at is not null or offer.sent_at is not null then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','offer_not_editable'));
  end if;
  select * into calculation from public.leader_lead_calculations where id=offer.calculation_id for update;
  if not found or calculation.is_current_revision is not true or calculation.lead_id is distinct from offer.lead_id then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','source_not_current'));
  end if;
  select * into lead from public.leader_leads where id=offer.lead_id for update;
  if not found then return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','not_found')); end if;
  if offer.order_id is not null or calculation.order_id is not null or lead.converted_order_id is not null then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','order_already_created'));
  end if;
  if offer.updated_at is distinct from expected then
    return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','conflict'));
  end if;
  update public.leader_commercial_offers
    set title=btrim(patch ->> 'title'), short_text=patch ->> 'short_text', full_text=patch ->> 'full_text',
        valid_until=(patch ->> 'valid_until')::date, updated_by=actor, updated_at=stamp
    where id=offer.id returning * into offer;
  insert into public.leader_commercial_offer_events(offer_id,lead_id,calculation_id,event_type,old_status,new_status,comment,created_by,created_by_email,created_at)
    values(offer.id,offer.lead_id,offer.calculation_id,'Изменено КП',offer.status,offer.status,
           'Обновлены текст и условия черновика КП',actor,left(lower(p_payload ->> 'actor_email'),240),stamp);
  result := jsonb_build_object('ok',true,'request_id',rid,'offer',to_jsonb(offer),'idempotent_replay',false);
  insert into leader_private.leader_command_receipts(action,idempotency_key,request_id,request_hash,actor_id,state,response,created_at,updated_at,completed_at)
    values('offer.update',key,rid,hash,actor,'success',result,stamp,stamp,stamp);
  return result;
exception when others then
  raise log 'leader_offer_update_failed request_id=% sqlstate=%',rid,SQLSTATE;
  return jsonb_build_object('ok',false,'request_id',rid,'error',jsonb_build_object('code','persistence_failed'));
end
$function$;
revoke all on function public.leader_update_offer_rpc(jsonb) from public,anon,authenticated;
grant execute on function public.leader_update_offer_rpc(jsonb) to service_role;

-- Keep only the authenticated SELECT and INSERT grants that already exist.
-- No UI deletes offers; status changes use the installed service-only RPC.
revoke all on public.leader_commercial_offers from public,anon;
revoke update,delete,truncate,references,trigger on public.leader_commercial_offers from authenticated;
do $columns$
declare col record;
begin
  for col in select attname from pg_attribute
    where attrelid='public.leader_commercial_offers'::regclass and attnum>0 and not attisdropped
  loop
    execute format('revoke select (%I),insert (%I),update (%I),references (%I) on public.leader_commercial_offers from public,anon',col.attname,col.attname,col.attname,col.attname);
    execute format('revoke update (%I),references (%I) on public.leader_commercial_offers from authenticated',col.attname,col.attname);
  end loop;
end
$columns$;

do $postflight$
begin
  if has_any_column_privilege('authenticated','public.leader_commercial_offers','UPDATE')
     or has_any_column_privilege('anon','public.leader_commercial_offers','UPDATE')
     or has_any_column_privilege('authenticated','public.leader_commercial_offers','REFERENCES')
     or has_any_column_privilege('anon','public.leader_commercial_offers','SELECT,INSERT,REFERENCES')
     or has_table_privilege('authenticated','public.leader_commercial_offers','DELETE')
     or has_table_privilege('authenticated','public.leader_commercial_offers','TRUNCATE,REFERENCES,TRIGGER')
     or has_table_privilege('anon','public.leader_commercial_offers','DELETE')
     or has_table_privilege('anon','public.leader_commercial_offers','TRUNCATE,REFERENCES,TRIGGER')
     or has_function_privilege('authenticated','public.leader_update_offer_rpc(jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.leader_update_offer_rpc(jsonb)','EXECUTE') then
    raise exception 'leader_offer_editor_privilege_postflight_failed';
  end if;
end
$postflight$;
