-- Additive document archive. No existing order, payment, profile or Auth updates.
begin;
set local lock_timeout='5s';
set local statement_timeout='45s';
do $$ begin
 if to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null then raise exception 'canonical_rbac_required'; end if;
 if to_regclass('public.leader_order_documents') is not null then raise exception 'document_archive_already_present'; end if;
end $$;

create table leader_private.leader_document_company (
 id integer primary key check(id=1), revision integer not null default 0,
 value jsonb not null default '{}', updated_by uuid, updated_at timestamptz not null default now()
);
insert into leader_private.leader_document_company(id) values(1);
create table leader_private.leader_document_number_counters (
 document_type text not null check(document_type in ('act','contract')), number_year integer not null,
 last_value bigint not null check(last_value>0), primary key(document_type,number_year)
);
create table leader_private.leader_document_receipts (
 actor_id uuid not null,request_id uuid not null,request jsonb not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(actor_id,request_id)
);
create table public.leader_order_documents (
 id uuid primary key default gen_random_uuid(), document_group_id uuid not null,
 previous_version_id uuid references public.leader_order_documents(id) on delete restrict,
 version integer not null check(version>0),order_id uuid not null references public.leader_orders(id) on delete restrict,
 client_id uuid references public.leader_clients(id) on delete set null,document_type text not null check(document_type in ('act','contract')),
 document_number text unique,document_date date not null,status text not null check(status in ('draft','generated','sent','signed','void')),
 total numeric(14,2) not null check(total>0),snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),snapshot_hash text not null,
 created_by uuid not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 sent_at timestamptz,signed_at timestamptz,voided_at timestamptz,void_reason text,
 unique(document_group_id,version),check(status in ('draft','void') or document_number is not null)
);
create index leader_order_documents_order on public.leader_order_documents(order_id,created_at desc,id);
create table public.leader_order_document_events (
 id uuid primary key default gen_random_uuid(),document_id uuid references public.leader_order_documents(id) on delete restrict,
 order_id uuid references public.leader_orders(id) on delete restrict,event_type text not null,
 old_status text,new_status text,comment text not null default '',created_by uuid not null,created_at timestamptz not null default now()
);
create index leader_order_document_events_document on public.leader_order_document_events(document_id,created_at);
do $$ declare t text; begin
 foreach t in array array['leader_private.leader_document_company','leader_private.leader_document_number_counters','leader_private.leader_document_receipts','public.leader_order_documents','public.leader_order_document_events'] loop
  execute format('alter table %s enable row level security',t);
  execute format('revoke all on %s from public,anon,authenticated',t);
  execute format('create policy leader_documents_service_only on %s to service_role using(true) with check(true)',t);
 end loop;
end $$;
grant usage on schema leader_private to service_role;
grant select,insert,update on leader_private.leader_document_company,leader_private.leader_document_number_counters,public.leader_order_documents to service_role;
grant select,insert on leader_private.leader_document_receipts,public.leader_order_document_events to service_role;

create function public.leader_document_workspace_rpc(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor uuid:=(p_payload->>'actor_id')::uuid; cmd jsonb:=p_payload->'request';
 op text:=cmd->>'operation';data jsonb:=cmd->'payload';req uuid;
 receipt leader_private.leader_document_receipts;company leader_private.leader_document_company;
 ord public.leader_orders;doc public.leader_order_documents;previous public.leader_order_documents;
 content jsonb;fields jsonb;item jsonb;clean_items jsonb:='[]';snapshot_value jsonb;result jsonb;
 quantity_value numeric;price_value numeric;sum_value numeric;total_value numeric:=0;
 group_id uuid;next_version integer;number_value text;seq bigint;year_value integer;date_value date;
 requested_status text;permission_value text;comment_value text;offset_value integer;allowed_keys text[];
begin
 if actor is null or jsonb_typeof(cmd) is distinct from 'object' or jsonb_typeof(data) is distinct from 'object' or octet_length(cmd::text)>262144
  or exists(select from jsonb_object_keys(cmd) k where k not in ('operation','request_id','payload')) then raise exception 'invalid_payload'; end if;
 permission_value:=case op when 'company.save' then 'settings.manage' when 'save' then 'documents.create' else 'documents.read' end;
 if not leader_private.leader_actor_has_crm_action(actor,permission_value) then raise exception 'forbidden';end if;
 if op='transition' and not leader_private.leader_actor_has_crm_action(actor,case data->>'status' when 'sent' then 'documents.send' when 'signed' then 'documents.sign' when 'void' then 'documents.void' else 'documents.invalid' end) then raise exception 'forbidden';end if;
 if op='save' and data->>'register'='true' and not leader_private.leader_actor_has_crm_action(actor,'documents.generate') then raise exception 'forbidden';end if;
 if op='save' and nullif(data->>'group_id','') is not null and not leader_private.leader_actor_has_crm_action(actor,'documents.update') then raise exception 'forbidden';end if;
 if op in ('save','company.save','transition') then
  req:=(cmd->>'request_id')::uuid;if req is null then raise exception 'invalid_payload';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||req::text,281026));
  select * into receipt from leader_private.leader_document_receipts where actor_id=actor and request_id=req;
  if found then
   if receipt.request is distinct from cmd then raise exception 'idempotency_conflict';end if;
   return receipt.response||jsonb_build_object('replay',true);
  end if;
 end if;
 if op='company.get' then
  select * into company from leader_private.leader_document_company where id=1;
  return jsonb_build_object('ok',true,'company',company.value,'revision',company.revision,'configured',company.revision>0);
 elsif op='company.save' then
  select * into company from leader_private.leader_document_company where id=1 for update;
  if (data->>'expected_revision')::integer is distinct from company.revision then raise exception 'source_changed';end if;
  fields:=data->'company';
  if data->>'confirmed' is distinct from 'true' or jsonb_typeof(fields) is distinct from 'object' then raise exception 'company_confirmation_required';end if;
  if exists(select from jsonb_each(fields) f where f.key not in ('brand_name','legal_name','tax_id','registration_number','legal_address','postal_address','phone','email','bank_name','bank_account','correspondent_account','bank_code','tax_mode','signatory_name','signatory_role','schema_version')
   or (f.key<>'schema_version' and (jsonb_typeof(f.value)<>'string' or length(f.value#>>'{}')>1000))) then raise exception 'invalid_payload';end if;
  if length(btrim(coalesce(fields->>'legal_name','')))=0 or length(btrim(coalesce(fields->>'tax_id','')))=0
   or length(btrim(coalesce(fields->>'legal_address','')))=0 or length(btrim(coalesce(fields->>'tax_mode','')))=0
   or length(btrim(coalesce(fields->>'signatory_name','')))=0 then raise exception 'company_incomplete';end if;
  update leader_private.leader_document_company set value=fields,revision=revision+1,updated_by=actor,updated_at=now() where id=1 returning * into company;
  insert into public.leader_order_document_events(event_type,created_by,comment) values('company.updated',actor,'Общие реквизиты подтверждены');
  result:=jsonb_build_object('ok',true,'revision',company.revision);
 elsif op='list' then
  if not exists(select from public.leader_orders where id=(data->>'order_id')::uuid) then raise exception 'not_found';end if;
  offset_value:=greatest(0,least(10000,coalesce((data->>'offset')::integer,0)));
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc,d.id),'[]') into result from
   (select id,order_id,document_group_id,version,document_type,document_number,document_date,status,total,snapshot_hash,created_at
    from public.leader_order_documents where order_id=(data->>'order_id')::uuid order by created_at desc,id limit 100 offset offset_value) d;
  return jsonb_build_object('ok',true,'rows',result,'has_more',jsonb_array_length(result)=100);
 elsif op='get' then
  select * into doc from public.leader_order_documents where id=(data->>'id')::uuid;
  if not found then raise exception 'not_found';end if;
  return jsonb_build_object('ok',true,'document',to_jsonb(doc),'events',coalesce((select jsonb_agg(to_jsonb(e)-'created_by' order by e.created_at,e.id) from public.leader_order_document_events e where e.document_id=doc.id),'[]'));
 elsif op='save' then
  if data->>'kind' not in ('act','contract') then raise exception 'invalid_payload';end if;
  requested_status:=case when data->>'register'='true' then 'generated' else 'draft' end;
  if requested_status='generated' and not leader_private.leader_actor_has_crm_action(actor,'documents.generate') then raise exception 'forbidden';end if;
  select * into ord from public.leader_orders where id=(data->>'order_id')::uuid for update;
  if not found then raise exception 'not_found';end if;
  if (data->>'expected_order_updated_at')::timestamptz is distinct from ord.updated_at then raise exception 'source_changed';end if;
  content:=data->'draft';
  if jsonb_typeof(content) is distinct from 'object' then raise exception 'invalid_payload';end if;
  allowed_keys:=array['number','date','basis','executor','executorDetails','customer','customerDetails','taxMode','signatory','signatoryRole','completionDate','completionText','claimsText','note','items','templateId','city','executorRepresentative','executorRole','customerRepresentative','customerAuthority','subject','workAddress','paymentMode','paymentDays','deadlineDays','deadlineBasis','acceptanceDays','warrantyMonths','penaltyPercent','additionalTerms'];
  if exists(select from jsonb_each(content) f where not(f.key=any(allowed_keys)) or (f.key<>'items' and (jsonb_typeof(f.value) not in ('string','number') or length(f.value#>>'{}')>16000))) then raise exception 'invalid_payload';end if;
  if jsonb_typeof(content->'items') is distinct from 'array' or jsonb_array_length(content->'items') not between 1 and 160 then raise exception 'invalid_items';end if;
  for item in select value from jsonb_array_elements(content->'items') loop
   if jsonb_typeof(item) is distinct from 'object' or exists(select from jsonb_object_keys(item) k where k not in ('name','unit','quantity','price','sum')) then raise exception 'invalid_items';end if;
   quantity_value:=(item->>'quantity')::numeric;price_value:=(item->>'price')::numeric;
   if quantity_value is null or price_value is null or quantity_value<=0 or quantity_value>1000000 or price_value<0 or price_value>1000000000
    or quantity_value<>round(quantity_value,4) or price_value<>round(price_value,6) or length(btrim(coalesce(item->>'name',''))) not between 1 and 700
    or length(btrim(coalesce(item->>'unit',''))) not between 1 and 50 then raise exception 'invalid_items';end if;
   sum_value:=round(quantity_value*price_value,2);
   if (item->>'sum')::numeric is null or abs((item->>'sum')::numeric-sum_value)>0.001 then raise exception 'line_total_mismatch';end if;
   total_value:=total_value+sum_value;
   clean_items:=clean_items||jsonb_build_array(jsonb_build_object('name',btrim(item->>'name'),'unit',btrim(item->>'unit'),'quantity',quantity_value,'price',price_value,'sum',sum_value));
  end loop;
  if total_value<=0 or total_value<>round(ord.client_total,2) then raise exception 'order_total_mismatch';end if;
  if length(btrim(coalesce(content->>'customer','')))=0 or length(btrim(coalesce(content->>'taxMode','')))=0 then raise exception 'document_incomplete';end if;
  date_value:=(content->>'date')::date;if date_value is null then raise exception 'document_incomplete';end if;
  select * into company from leader_private.leader_document_company where id=1;
  if requested_status='generated' and company.revision=0 then raise exception 'company_incomplete';end if;
  if requested_status='generated' then
   if content->>'executor' is distinct from company.value->>'legal_name' or content->>'taxMode' is distinct from company.value->>'tax_mode' then raise exception 'company_changed';end if;
   select string_agg(label||': '||val,E'\n' order by position) into comment_value from
    (select x.position,x.label,company.value->>x.key val from (values
     (1,'tax_id','ИНН'),(2,'registration_number','Регистрационный номер'),(3,'legal_address','Адрес'),(4,'postal_address','Почтовый адрес'),(5,'phone','Телефон'),(6,'email','Email'),(7,'bank_name','Банк'),(8,'bank_account','Р/с'),(9,'correspondent_account','К/с'),(10,'bank_code','БИК')) x(position,key,label)) details where length(coalesce(val,''))>0;
   content:=content||jsonb_build_object('executorDetails',coalesce(comment_value,''),'signatory',company.value->>'signatory_name','signatoryRole',coalesce(company.value->>'signatory_role','Представитель исполнителя'),'executorRepresentative',company.value->>'signatory_name','executorRole',coalesce(company.value->>'signatory_role','Представитель исполнителя'));
  end if;
  if data->>'kind'='contract' then
   if jsonb_typeof(data->'resolved_sections') is distinct from 'array' or jsonb_array_length(data->'resolved_sections') not between 1 and 40 then raise exception 'document_incomplete';end if;
   for item in select value from jsonb_array_elements(data->'resolved_sections') loop
    if jsonb_typeof(item) is distinct from 'object' or length(coalesce(item->>'title','')) not between 1 and 300 or jsonb_typeof(item->'paragraphs') is distinct from 'array' or jsonb_array_length(item->'paragraphs')>40 then raise exception 'invalid_payload';end if;
    if exists(select from jsonb_array_elements(item->'paragraphs') p where jsonb_typeof(p)<>'string' or length(p#>>'{}')>8000) then raise exception 'invalid_payload';end if;
   end loop;
  end if;
  group_id:=coalesce(nullif(data->>'group_id','')::uuid,gen_random_uuid());
  perform pg_advisory_xact_lock(hashtextextended(group_id::text,281027));
  select * into previous from public.leader_order_documents where document_group_id=group_id order by version desc limit 1 for update;
  if found then
   if previous.order_id<>ord.id or previous.document_type<>data->>'kind' then raise exception 'invalid_payload';end if;
   if previous.status in ('signed','void') then raise exception 'terminal_document';end if;
   if not leader_private.leader_actor_has_crm_action(actor,'documents.update') then raise exception 'forbidden';end if;
   if (data->>'expected_version')::integer is distinct from previous.version then raise exception 'source_changed';end if;
  elsif coalesce((data->>'expected_version')::integer,0)<>0 then raise exception 'source_changed';end if;
  next_version:=coalesce(previous.version,0)+1;
  if requested_status='generated' then
   year_value:=extract(year from date_value)::integer;
   insert into leader_private.leader_document_number_counters(document_type,number_year,last_value) values(data->>'kind',year_value,1)
    on conflict(document_type,number_year) do update set last_value=leader_private.leader_document_number_counters.last_value+1 returning last_value into seq;
   number_value:=case data->>'kind' when 'act' then 'АВР' else 'ДГВ' end||'-'||year_value::text||'-'||lpad(seq::text,4,'0');
  end if;
  content:=content||jsonb_build_object('items',clean_items,'number',coalesce(number_value,'ЧЕРНОВИК'));
  snapshot_value:=jsonb_build_object('schema_version',1,'kind',data->>'kind','draft',content,'company',company.value,'company_revision',company.revision,
   'order',jsonb_build_object('id',ord.id,'number',ord.order_number,'updated_at',ord.updated_at,'project_name',ord.project_name),
   'contract_sections',case when data->>'kind'='contract' then data->'resolved_sections' else null end,'currency','RUB','total',total_value,'registered',requested_status='generated');
  insert into public.leader_order_documents(document_group_id,previous_version_id,version,order_id,client_id,document_type,document_number,document_date,status,total,snapshot,snapshot_hash,created_by)
   values(group_id,previous.id,next_version,ord.id,ord.client_id,data->>'kind',number_value,date_value,requested_status,total_value,snapshot_value,encode(extensions.digest(snapshot_value::text,'sha256'),'hex'),actor) returning * into doc;
  insert into public.leader_order_document_events(document_id,order_id,event_type,new_status,created_by) values(doc.id,ord.id,'created',requested_status,actor);
  result:=jsonb_build_object('ok',true,'id',doc.id,'group_id',group_id,'version',doc.version,'number',doc.document_number,'status',doc.status,'snapshot_hash',doc.snapshot_hash);
 elsif op='transition' then
  select * into doc from public.leader_order_documents where id=(data->>'id')::uuid for update;
  if not found then raise exception 'not_found';end if;
  requested_status:=data->>'status';comment_value:=btrim(coalesce(data->>'comment',''));
  permission_value:=case requested_status when 'sent' then 'documents.send' when 'signed' then 'documents.sign' when 'void' then 'documents.void' else null end;
  if permission_value is null or not leader_private.leader_actor_has_crm_action(actor,permission_value) then raise exception 'forbidden';end if;
  if length(comment_value) not between 3 and 2000 then raise exception 'comment_required';end if;
  if doc.status in ('signed','void') then raise exception 'terminal_document';end if;
  if doc.status is distinct from data->>'expected_status' or exists(select from public.leader_order_documents where document_group_id=doc.document_group_id and version>doc.version) then raise exception 'source_changed';end if;
  if not((requested_status='void') or (requested_status='sent' and doc.status='generated') or (requested_status='signed' and doc.status in ('generated','sent'))) then raise exception 'invalid_transition';end if;
  insert into public.leader_order_document_events(document_id,order_id,event_type,old_status,new_status,comment,created_by) values(doc.id,doc.order_id,'status',doc.status,requested_status,comment_value,actor);
  update public.leader_order_documents set status=requested_status,updated_at=now(),sent_at=case when requested_status='sent' then now() else sent_at end,
   signed_at=case when requested_status='signed' then now() else signed_at end,voided_at=case when requested_status='void' then now() else voided_at end,
   void_reason=case when requested_status='void' then comment_value else void_reason end where id=doc.id;
  result:=jsonb_build_object('ok',true,'id',doc.id,'status',requested_status);
 else raise exception 'invalid_operation';end if;
 insert into leader_private.leader_document_receipts(actor_id,request_id,request,response) values(actor,req,cmd,result);
 return result;
exception when others then
 return jsonb_build_object('ok',false,'error',jsonb_build_object('code',case when SQLERRM in ('forbidden','invalid_payload','idempotency_conflict','source_changed','not_found','company_confirmation_required','company_incomplete','company_changed','invalid_items','line_total_mismatch','order_total_mismatch','document_incomplete','terminal_document','comment_required','invalid_transition','invalid_operation') then SQLERRM when SQLSTATE in ('22P02','22007','22008','22003','23502','23503','23514') then 'invalid_payload' else 'document_command_failed' end));
end $$;
revoke all on function public.leader_document_workspace_rpc(jsonb) from public,anon,authenticated;
grant execute on function public.leader_document_workspace_rpc(jsonb) to service_role;
commit;
