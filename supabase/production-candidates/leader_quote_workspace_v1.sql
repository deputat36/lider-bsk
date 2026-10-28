-- Reviewed additive package; no existing business table/role/Auth changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
set local search_path=public,extensions;

do $$ begin
 if to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null then raise exception 'canonical_rbac_required'; end if;
 if to_regclass('public.leader_quote_requests') is not null or to_regprocedure('public.leader_quote_workspace_rpc(jsonb)') is not null then raise exception 'quotes_already_present_review_history'; end if;
end $$;

create table public.leader_quote_events (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  kind text not null,
  message text default ''::text not null,
  actor_id uuid not null,
  created_at timestamp with time zone default clock_timestamp() not null
);

create table public.leader_quote_requests (
  id uuid default gen_random_uuid() not null,
  lead_id uuid not null,
  need_id uuid,
  assignee_id uuid,
  vendor_name text not null,
  title text not null,
  brief text not null,
  reference_url text,
  deadline timestamp with time zone,
  status text default 'new'::text not null,
  revision integer default 1 not null,
  brief_version integer default 1 not null,
  current_quote_id uuid,
  created_by uuid not null,
  created_at timestamp with time zone default clock_timestamp() not null,
  updated_at timestamp with time zone default clock_timestamp() not null
);

create table public.leader_quote_revisions (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  version integer not null,
  brief_version integer not null,
  items jsonb not null,
  note text default ''::text not null,
  valid_until timestamp with time zone,
  lead_time text default ''::text not null,
  created_by uuid not null,
  created_at timestamp with time zone default clock_timestamp() not null
);

create table public.leader_quote_templates (
  id uuid default gen_random_uuid() not null,
  name text not null,
  category text default ''::text not null,
  vendor_name text not null,
  items jsonb not null,
  source_task_id uuid not null,
  source_quote_id uuid not null,
  cost_date timestamp with time zone not null,
  valid_until timestamp with time zone,
  is_active boolean default true not null,
  created_by uuid not null,
  created_at timestamp with time zone default clock_timestamp() not null
);

create table leader_private.leader_quote_receipts (
  actor_id uuid not null,
  request_id uuid not null,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamp with time zone default clock_timestamp() not null
);

alter table public.leader_quote_events add constraint leader_quote_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.leader_user_profiles(user_id);

alter table public.leader_quote_events add constraint leader_quote_events_pkey PRIMARY KEY (id);

alter table public.leader_quote_events add constraint leader_quote_events_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.leader_quote_requests(id);

alter table leader_private.leader_quote_receipts add constraint leader_quote_receipts_pkey PRIMARY KEY (actor_id, request_id);

alter table public.leader_quote_requests add constraint leader_quote_requests_assignee_id_fkey FOREIGN KEY (assignee_id) REFERENCES public.leader_user_profiles(user_id);

alter table public.leader_quote_requests add constraint leader_quote_requests_brief_check CHECK (((length(brief) >= 1) AND (length(brief) <= 10000)));

alter table public.leader_quote_requests add constraint leader_quote_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.leader_user_profiles(user_id);

alter table public.leader_quote_requests add constraint leader_quote_requests_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leader_leads(id);

alter table public.leader_quote_requests add constraint leader_quote_requests_need_id_fkey FOREIGN KEY (need_id) REFERENCES public.leader_lead_needs(id);

alter table public.leader_quote_requests add constraint leader_quote_requests_pkey PRIMARY KEY (id);

alter table public.leader_quote_requests add constraint leader_quote_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'clarification'::text, 'review'::text, 'changes'::text, 'accepted'::text, 'cancelled'::text])));

alter table public.leader_quote_requests add constraint leader_quote_requests_title_check CHECK (((length(title) >= 1) AND (length(title) <= 300)));

alter table public.leader_quote_requests add constraint leader_quote_requests_vendor_name_check CHECK (((length(vendor_name) >= 1) AND (length(vendor_name) <= 300)));

alter table public.leader_quote_revisions add constraint leader_quote_revisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.leader_user_profiles(user_id);

alter table public.leader_quote_revisions add constraint leader_quote_revisions_pkey PRIMARY KEY (id);

alter table public.leader_quote_revisions add constraint leader_quote_revisions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.leader_quote_requests(id);

alter table public.leader_quote_revisions add constraint leader_quote_revisions_task_id_version_key UNIQUE (task_id, version);

alter table public.leader_quote_templates add constraint leader_quote_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.leader_user_profiles(user_id);

alter table public.leader_quote_templates add constraint leader_quote_templates_name_check CHECK (((length(name) >= 1) AND (length(name) <= 300)));

alter table public.leader_quote_templates add constraint leader_quote_templates_pkey PRIMARY KEY (id);

alter table public.leader_quote_templates add constraint leader_quote_templates_source_quote_id_fkey FOREIGN KEY (source_quote_id) REFERENCES public.leader_quote_revisions(id);

alter table public.leader_quote_templates add constraint leader_quote_templates_source_task_id_fkey FOREIGN KEY (source_task_id) REFERENCES public.leader_quote_requests(id);

create index leader_quote_requests_lead_idx on public.leader_quote_requests(lead_id,created_at desc);

create index leader_quote_requests_assignee_idx on public.leader_quote_requests(assignee_id,created_at desc);

create index leader_quote_requests_need_idx on public.leader_quote_requests(need_id) where need_id is not null;

create index leader_quote_events_task_idx on public.leader_quote_events(task_id,created_at);

alter table public.leader_quote_events enable row level security;

revoke all on public.leader_quote_events from public,anon,authenticated;

create policy leader_quote_service_only on public.leader_quote_events to service_role using(true) with check(true);

grant select,insert on public.leader_quote_events to service_role;

alter table public.leader_quote_requests enable row level security;

revoke all on public.leader_quote_requests from public,anon,authenticated;

create policy leader_quote_service_only on public.leader_quote_requests to service_role using(true) with check(true);

grant select,insert,update on public.leader_quote_requests to service_role;

alter table public.leader_quote_revisions enable row level security;

revoke all on public.leader_quote_revisions from public,anon,authenticated;

create policy leader_quote_service_only on public.leader_quote_revisions to service_role using(true) with check(true);

grant select,insert on public.leader_quote_revisions to service_role;

alter table public.leader_quote_templates enable row level security;

revoke all on public.leader_quote_templates from public,anon,authenticated;

create policy leader_quote_service_only on public.leader_quote_templates to service_role using(true) with check(true);

grant select,insert,update on public.leader_quote_templates to service_role;

alter table leader_private.leader_quote_receipts enable row level security;

revoke all on leader_private.leader_quote_receipts from public,anon,authenticated;

create policy leader_quote_service_only on leader_private.leader_quote_receipts to service_role using(true) with check(true);

grant select,insert on leader_private.leader_quote_receipts to service_role;

grant usage on schema leader_private to service_role;

-- Recovered SELECT-only from staging otulfnouybahfnsycxqn on 2026-10-22.
-- Function snapshot only; not a production migration. Tables, constraints and ACL must be reviewed separately.

CREATE OR REPLACE FUNCTION leader_private.leader_quote_clean_items_v1(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE i jsonb; result jsonb:='[]'; ids uuid[]:='{}'; item_id uuid; qty numeric; cost numeric;
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'invalid_items';END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR EXISTS(SELECT FROM jsonb_object_keys(i) k WHERE k NOT IN ('id','name','specification','qty','unit','unit_cost')) THEN RAISE EXCEPTION 'invalid_items';END IF;
  item_id:=(i->>'id')::uuid;
  IF item_id IS NULL OR item_id=ANY(ids) THEN RAISE EXCEPTION 'invalid_items';END IF;
  ids:=array_append(ids,item_id);
  IF jsonb_typeof(i->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(i->'unit_cost') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid_items';END IF;
  qty:=(i->>'qty')::numeric;cost:=(i->>'unit_cost')::numeric;
  IF qty<=0 OR qty>1000000 OR cost<0 OR cost>1000000000 OR qty<>round(qty,3) OR cost<>round(cost,2)
   OR length(btrim(coalesce(i->>'name',''))) NOT BETWEEN 1 AND 500 OR length(btrim(coalesce(i->>'unit',''))) NOT BETWEEN 1 AND 40
   OR length(coalesce(i->>'specification',''))>2000 THEN RAISE EXCEPTION 'invalid_items';END IF;
  result:=result||jsonb_build_array(jsonb_build_object('id',item_id,'name',btrim(i->>'name'),'specification',coalesce(i->>'specification',''),'qty',qty,'unit',btrim(i->>'unit'),'unit_cost',cost));
 END LOOP;
 RETURN result;
END$function$
;

CREATE OR REPLACE FUNCTION public.leader_quote_workspace_rpc(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 actor uuid:=(p_payload->>'actor_id')::uuid; cmd jsonb:=p_payload->'request'; op text:=cmd->>'operation';
 data jsonb:=coalesce(cmd->'payload','{}'); req uuid; target uuid; prof public.leader_user_profiles%ROWTYPE;
 task public.leader_quote_requests%ROWTYPE; quote public.leader_quote_revisions%ROWTYPE; tpl public.leader_quote_templates%ROWTYPE;
 receipt leader_private.leader_quote_receipts%ROWTYPE; manager boolean; responder boolean; selected jsonb; v_items jsonb;
 result jsonb; event_message text:=btrim(coalesce(data->>'message','')); offset_rows integer; total integer; changed boolean:=false;
BEGIN
 SELECT * INTO prof FROM public.leader_user_profiles WHERE user_id=actor;
 IF NOT FOUND OR prof.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'forbidden';END IF;
 manager:=leader_private.leader_actor_has_crm_action(actor,'calculations.write') AND leader_private.leader_actor_has_crm_action(actor,'needs.read');
 responder:=prof.role='contractor' AND leader_private.leader_actor_has_crm_action(actor,'production.write');
 IF NOT(manager OR responder) THEN RAISE EXCEPTION 'forbidden';END IF;
 IF jsonb_typeof(cmd) IS DISTINCT FROM 'object' OR jsonb_typeof(data) IS DISTINCT FROM 'object' OR octet_length(cmd::text)>262144 THEN RAISE EXCEPTION 'invalid_payload';END IF;
 IF op='list' THEN
  offset_rows:=greatest(0,least(10000,coalesce((data->>'offset')::integer,0)));
  SELECT jsonb_agg(j ORDER BY created_at DESC,id) INTO result FROM (
   SELECT r.id,r.created_at,jsonb_build_object('id',r.id,'title',r.title,'vendor_name',r.vendor_name,'status',r.status,'revision',r.revision,'deadline',r.deadline,'updated_at',r.updated_at)||CASE WHEN manager THEN jsonb_build_object('lead_id',r.lead_id,'need_id',r.need_id) ELSE '{}'::jsonb END j
   FROM public.leader_quote_requests r WHERE (manager OR r.assignee_id=actor) AND (NOT manager OR nullif(data->>'lead_id','') IS NULL OR r.lead_id=(data->>'lead_id')::uuid)
   ORDER BY r.created_at DESC,r.id LIMIT 50 OFFSET offset_rows
  ) rows;
  RETURN jsonb_build_object('ok',true,'rows',coalesce(result,'[]'),'has_more',jsonb_array_length(coalesce(result,'[]'))=50);
 ELSIF op='assignees' THEN
  IF NOT manager THEN RAISE EXCEPTION 'forbidden';END IF;
  SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',coalesce(nullif(full_name,''),'Подрядчик')) ORDER BY full_name,user_id) INTO result FROM public.leader_user_profiles WHERE is_active AND role='contractor';
  RETURN jsonb_build_object('ok',true,'rows',coalesce(result,'[]'));
 ELSIF op='template.list' THEN
  IF NOT manager THEN RAISE EXCEPTION 'forbidden';END IF;
  offset_rows:=greatest(0,least(10000,coalesce((data->>'offset')::integer,0)));
  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.id) INTO result FROM (SELECT id,name,category,vendor_name,cost_date,valid_until,created_at FROM public.leader_quote_templates WHERE is_active AND (coalesce(data->>'search','')='' OR name ILIKE '%'||(data->>'search')||'%' OR category ILIKE '%'||(data->>'search')||'%') ORDER BY created_at DESC,id LIMIT 50 OFFSET offset_rows) t;
  RETURN jsonb_build_object('ok',true,'rows',coalesce(result,'[]'),'has_more',jsonb_array_length(coalesce(result,'[]'))=50);
 ELSIF op='template.get' THEN
  IF NOT manager THEN RAISE EXCEPTION 'forbidden';END IF;
  SELECT * INTO tpl FROM public.leader_quote_templates WHERE id=(data->>'template_id')::uuid AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found';END IF;
  RETURN jsonb_build_object('ok',true,'template',to_jsonb(tpl)-'created_by'-'source_task_id','expired',tpl.valid_until<clock_timestamp());
 END IF;
 target:=(data->>'task_id')::uuid;
 IF op='create' THEN
  IF NOT manager THEN RAISE EXCEPTION 'forbidden';END IF;
 ELSE
  SELECT * INTO task FROM public.leader_quote_requests WHERE id=target FOR UPDATE;
  IF NOT FOUND OR (NOT manager AND task.assignee_id IS DISTINCT FROM actor) THEN RAISE EXCEPTION 'not_found';END IF;
 END IF;
 IF op='detail' THEN
  result:=jsonb_build_object('id',task.id,'title',task.title,'vendor_name',task.vendor_name,'brief',task.brief,'reference_url',task.reference_url,'deadline',task.deadline,'status',task.status,'revision',task.revision,'brief_version',task.brief_version,'current_quote_id',task.current_quote_id,'updated_at',task.updated_at);
  IF manager THEN result:=result||jsonb_build_object('lead_id',task.lead_id,'need_id',task.need_id,'assignee_id',task.assignee_id);END IF;
  RETURN jsonb_build_object('ok',true,'task',result,
   'quotes',coalesce((SELECT jsonb_agg(to_jsonb(q)-'created_by' ORDER BY q.version DESC) FROM public.leader_quote_revisions q WHERE q.task_id=target),'[]'),
   'events',coalesce((SELECT jsonb_agg(to_jsonb(e)-'actor_id' ORDER BY e.created_at,e.id) FROM public.leader_quote_events e WHERE e.task_id=target),'[]'));
 END IF;
 IF op='selection' THEN
  IF NOT manager OR task.status<>'accepted' THEN RAISE EXCEPTION 'quote_not_accepted';END IF;
 ELSE
  IF op NOT IN ('create','respond','clarify','change','update','accept','cancel','template.save') THEN RAISE EXCEPTION 'unknown_action';END IF;
  IF op NOT IN ('respond','clarify') AND NOT manager THEN RAISE EXCEPTION 'forbidden';END IF;
  req:=(cmd->>'request_id')::uuid;
  IF req IS NULL OR target IS NULL THEN RAISE EXCEPTION 'invalid_payload';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||req::text,0));
  SELECT * INTO receipt FROM leader_private.leader_quote_receipts WHERE actor_id=actor AND request_id=req;
  IF FOUND THEN
   IF receipt.payload IS DISTINCT FROM cmd THEN RAISE EXCEPTION 'idempotency_conflict';END IF;
   RETURN receipt.response||jsonb_build_object('replay',true);
  END IF;
  IF op<>'create' AND coalesce((cmd->>'expected_revision')::integer,0)<>task.revision THEN RAISE EXCEPTION 'source_changed';END IF;
 END IF;
 IF op='create' THEN
  IF EXISTS(SELECT FROM public.leader_quote_requests WHERE id=target) THEN RAISE EXCEPTION 'source_changed';END IF;
  IF length(btrim(coalesce(data->>'title',''))) NOT BETWEEN 1 AND 300 OR length(btrim(coalesce(data->>'brief',''))) NOT BETWEEN 1 AND 10000 OR length(btrim(coalesce(data->>'vendor_name',''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'invalid_payload';END IF;
  IF NOT EXISTS(SELECT FROM public.leader_leads WHERE id=(data->>'lead_id')::uuid) THEN RAISE EXCEPTION 'not_found';END IF;
  IF nullif(data->>'need_id','') IS NOT NULL AND NOT EXISTS(SELECT FROM public.leader_lead_needs WHERE id=(data->>'need_id')::uuid AND lead_id=(data->>'lead_id')::uuid) THEN RAISE EXCEPTION 'invalid_need';END IF;
  IF nullif(data->>'assignee_id','') IS NOT NULL AND NOT EXISTS(SELECT FROM public.leader_user_profiles WHERE user_id=(data->>'assignee_id')::uuid AND role='contractor' AND is_active) THEN RAISE EXCEPTION 'invalid_assignee';END IF;
  IF nullif(data->>'reference_url','') IS NOT NULL AND (length(data->>'reference_url')>2000 OR (data->>'reference_url')!~* '^https://[^[:space:]/@]+(/[^[:space:]]*)?$') THEN RAISE EXCEPTION 'invalid_url';END IF;
  INSERT INTO public.leader_quote_requests(id,lead_id,need_id,assignee_id,vendor_name,title,brief,reference_url,deadline,created_by)
  VALUES(target,(data->>'lead_id')::uuid,nullif(data->>'need_id','')::uuid,nullif(data->>'assignee_id','')::uuid,btrim(data->>'vendor_name'),btrim(data->>'title'),btrim(data->>'brief'),nullif(data->>'reference_url',''),nullif(data->>'deadline','')::timestamptz,actor) RETURNING * INTO task;
 ELSIF op='respond' THEN
  IF task.status NOT IN ('new','changes','clarification') THEN RAISE EXCEPTION 'invalid_transition';END IF;
  IF manager AND length(btrim(coalesce(data->>'source_note','')))=0 THEN RAISE EXCEPTION 'response_source_required';END IF;
  v_items:=leader_private.leader_quote_clean_items_v1(data->'items');
  IF length(coalesce(data->>'note',''))>5000 OR length(coalesce(data->>'source_note',''))>1000 OR length(coalesce(data->>'lead_time',''))>1000 THEN RAISE EXCEPTION 'invalid_payload';END IF;
  INSERT INTO public.leader_quote_revisions(task_id,version,brief_version,items,note,valid_until,lead_time,created_by)
   SELECT target,coalesce(max(version),0)+1,task.brief_version,v_items,concat_ws(E'\n',nullif(data->>'source_note',''),data->>'note'),nullif(data->>'valid_until','')::timestamptz,coalesce(data->>'lead_time',''),actor FROM public.leader_quote_revisions WHERE task_id=target RETURNING * INTO quote;
  UPDATE public.leader_quote_requests SET status='review',current_quote_id=quote.id WHERE id=target;
 ELSIF op IN ('clarify','change') THEN
  IF length(event_message) NOT BETWEEN 1 AND 5000 OR task.status IN ('cancelled','accepted') THEN RAISE EXCEPTION 'invalid_transition';END IF;
  IF op='change' AND task.status<>'review' THEN RAISE EXCEPTION 'invalid_transition';END IF;
  UPDATE public.leader_quote_requests SET status=CASE WHEN op='change' THEN 'changes' ELSE 'clarification' END WHERE id=target;
 ELSIF op='update' THEN
  IF task.status IN ('cancelled','accepted') OR length(btrim(coalesce(data->>'brief',''))) NOT BETWEEN 1 AND 10000 OR length(event_message) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid_payload';END IF;
  UPDATE public.leader_quote_requests SET brief=btrim(data->>'brief'),brief_version=brief_version+1,current_quote_id=NULL,status='new' WHERE id=target;
 ELSIF op='cancel' THEN
  IF task.status IN ('accepted','cancelled') OR length(event_message) NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'invalid_transition';END IF;
  UPDATE public.leader_quote_requests SET status='cancelled' WHERE id=target;
 ELSE
  SELECT * INTO quote FROM public.leader_quote_revisions WHERE id=task.current_quote_id AND task_id=target;
  IF NOT FOUND OR quote.brief_version<>task.brief_version THEN RAISE EXCEPTION 'source_changed';END IF;
  IF quote.valid_until IS NOT NULL AND quote.valid_until<clock_timestamp() THEN RAISE EXCEPTION 'quote_expired';END IF;
  IF op='accept' THEN
   IF task.status<>'review' THEN RAISE EXCEPTION 'invalid_transition';END IF;
   UPDATE public.leader_quote_requests SET status='accepted' WHERE id=target;
  ELSIF op IN ('selection','template.save') THEN
   IF task.status<>'accepted' OR (data->>'quote_id')::uuid IS DISTINCT FROM quote.id THEN RAISE EXCEPTION 'source_changed';END IF;
   IF jsonb_typeof(data->'item_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(data->'item_ids') NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'invalid_selection';END IF;
   SELECT jsonb_agg(i ORDER BY ord) INTO selected FROM jsonb_array_elements(quote.items) WITH ORDINALITY AS line(i,ord) WHERE data->'item_ids' ? (i->>'id');
   IF coalesce(jsonb_array_length(selected),0)<>jsonb_array_length(data->'item_ids') THEN RAISE EXCEPTION 'invalid_selection';END IF;
   IF op='selection' THEN RETURN jsonb_build_object('ok',true,'items',selected,'lead_id',task.lead_id,'quote_id',quote.id,'task_id',task.id,'revision',task.revision,'vendor_name',task.vendor_name);END IF;
   IF length(btrim(coalesce(data->>'name',''))) NOT BETWEEN 1 AND 300 OR length(coalesce(data->>'category',''))>300 THEN RAISE EXCEPTION 'invalid_payload';END IF;
   INSERT INTO public.leader_quote_templates(name,category,vendor_name,items,source_task_id,source_quote_id,cost_date,valid_until,created_by)
    VALUES(btrim(data->>'name'),coalesce(data->>'category',''),task.vendor_name,selected,target,quote.id,quote.created_at,quote.valid_until,actor) RETURNING * INTO tpl;
  END IF;
 END IF;
 IF op NOT IN ('create','template.save') THEN
  UPDATE public.leader_quote_requests SET revision=revision+1,updated_at=clock_timestamp() WHERE id=target RETURNING * INTO task;
 END IF;
 INSERT INTO public.leader_quote_events(task_id,kind,message,actor_id) VALUES(target,op,event_message,actor);
 result:=jsonb_build_object('ok',true,'task_id',target,'revision',task.revision,'quote_id',quote.id,'template_id',tpl.id);
 INSERT INTO leader_private.leader_quote_receipts(actor_id,request_id,payload,response) VALUES(actor,req,cmd,result);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code',CASE WHEN SQLERRM IN ('forbidden','not_found','invalid_payload','invalid_items','invalid_need','invalid_assignee','invalid_url','invalid_transition','source_changed','idempotency_conflict','invalid_selection','quote_not_accepted','quote_expired','response_source_required','unknown_action') THEN SQLERRM WHEN SQLSTATE IN ('22P02','22007','22008','23502','23503','23514') THEN 'invalid_payload' ELSE 'quote_command_failed' END));
END$function$
;


revoke all on function leader_private.leader_quote_clean_items_v1(jsonb),public.leader_quote_workspace_rpc(jsonb) from public,anon,authenticated;

grant execute on function leader_private.leader_quote_clean_items_v1(jsonb),public.leader_quote_workspace_rpc(jsonb) to service_role;

commit;
