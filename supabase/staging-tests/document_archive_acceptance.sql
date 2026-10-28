-- Synthetic rows only, always ROLLBACK. Does not create Auth users or edit real profiles.
begin;
do $$ begin
 if exists(select from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-0000000006%') then raise exception 'document_fixture_collision';end if;
end $$;
insert into public.leader_user_profiles(user_id,role,is_active,full_name) values
 ('90000000-0000-4000-8000-000000000601','owner',true,'Synthetic document owner'),
 ('90000000-0000-4000-8000-000000000602','manager',true,'Synthetic document manager');
update public.leader_user_profiles set is_active=true,role=case user_id when '90000000-0000-4000-8000-000000000601' then 'owner' else 'manager' end
 where user_id in ('90000000-0000-4000-8000-000000000601','90000000-0000-4000-8000-000000000602');
insert into public.leader_orders(id,owner_id,project_name,client_name,client_total)
 select '90000000-0000-4000-8000-000000000603',user_id,'Synthetic archive order','Synthetic customer',100
 from public.leader_user_profiles where role='owner' and is_active and user_id::text not like '90000000%' limit 1;
set local role service_role;
do $$
declare actor uuid:='90000000-0000-4000-8000-000000000601';manager_id uuid:='90000000-0000-4000-8000-000000000602';
 cmd jsonb;r jsonb;doc_id uuid;group_id uuid;draft jsonb;rev timestamptz;company_rev integer;seq_before bigint;
begin
 if has_function_privilege('authenticated','public.leader_document_workspace_rpc(jsonb)','EXECUTE') then raise exception 'document_rpc_public';end if;
 select updated_at into rev from public.leader_orders where id='90000000-0000-4000-8000-000000000603';if rev is null then raise exception 'fixture_parent_required';end if;
 select revision into company_rev from leader_private.leader_document_company where id=1;
 cmd:=jsonb_build_object('operation','company.save','request_id',gen_random_uuid(),'payload',jsonb_build_object('expected_revision',company_rev,'confirmed',true,'company',jsonb_build_object('legal_name','Synthetic Company','tax_id','000000000000','legal_address','Synthetic address','tax_mode','Без НДС','signatory_name','Synthetic representative')));
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',cmd));if r->'error'->>'code' is distinct from 'forbidden' then raise exception 'company_permissions %',r;end if;
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'ok' is distinct from 'true' then raise exception 'company_save %',r;end if;
 draft:='{"date":"2026-10-28","executor":"Synthetic Company","customer":"Synthetic customer","taxMode":"Без НДС","items":[{"name":"Synthetic print","unit":"шт","quantity":3,"price":33.333333,"sum":100}]}';
 cmd:=jsonb_build_object('operation','save','request_id',gen_random_uuid(),'payload',jsonb_build_object('kind','act','order_id','90000000-0000-4000-8000-000000000603','expected_order_updated_at',rev,'draft',draft,'register',true));
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'ok' is distinct from 'true' or r->>'number' is null then raise exception 'document_save %',r;end if;
 doc_id:=(r->>'id')::uuid;group_id:=(r->>'group_id')::uuid;
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'replay' is distinct from 'true' or (r->>'id')::uuid<>doc_id then raise exception 'document_replay %',r;end if;
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',actor,'request',cmd||jsonb_build_object('payload',(cmd->'payload')||jsonb_build_object('register',false))));if r->'error'->>'code' is distinct from 'idempotency_conflict' then raise exception 'document_conflict %',r;end if;
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',actor,'request',jsonb_build_object('operation','get','payload',jsonb_build_object('id',doc_id))));
 if r->'document'->'snapshot' ? 'contractor_cost' or r->'document'->'snapshot' ? 'profit' or (r->'document'->>'total')::numeric<>100 then raise exception 'document_projection';end if;
 cmd:=jsonb_build_object('operation','transition','request_id',gen_random_uuid(),'payload',jsonb_build_object('id',doc_id,'expected_status','generated','status','signed','comment','Synthetic signed fact'));
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',manager_id,'request',cmd));if r->'error'->>'code' is distinct from 'forbidden' then raise exception 'manager_sign %',r;end if;
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'ok' is distinct from 'true' then raise exception 'document_sign %',r;end if;
 cmd:=jsonb_build_object('operation','save','request_id',gen_random_uuid(),'payload',jsonb_build_object('kind','act','order_id','90000000-0000-4000-8000-000000000603','expected_order_updated_at',rev,'draft',draft,'group_id',group_id,'expected_version',1));
 r:=public.leader_document_workspace_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->'error'->>'code' is distinct from 'terminal_document' then raise exception 'signed_document_immutable %',r;end if;
 if (select count(*) from public.leader_order_documents where order_id='90000000-0000-4000-8000-000000000603')<>1 then raise exception 'duplicate_documents';end if;
end $$;
reset role;
rollback;
select jsonb_build_object('document_acceptance',true,'fixture_orders',(select count(*) from public.leader_orders where id='90000000-0000-4000-8000-000000000603'),'fixture_profiles',(select count(*) from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-0000000006%'));
