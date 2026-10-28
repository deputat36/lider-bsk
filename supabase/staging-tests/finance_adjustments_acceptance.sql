-- Synthetic fixture only. Entire proof rolls back, including money, audit and profiles.
begin;
do $$ begin
 if exists(select from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-0000000005%') then raise exception 'finance_fixture_collision';end if;
end $$;
insert into public.leader_user_profiles(user_id,role,is_active,full_name) values
 ('90000000-0000-4000-8000-000000000501','owner',true,'Synthetic finance owner'),
 ('90000000-0000-4000-8000-000000000502','manager',true,'Synthetic finance manager');
update public.leader_user_profiles set is_active=true,role=case user_id when '90000000-0000-4000-8000-000000000501' then 'owner' else 'manager' end
 where user_id in ('90000000-0000-4000-8000-000000000501','90000000-0000-4000-8000-000000000502');
insert into public.leader_clients(id,owner_id,name) values('90000000-0000-4000-8000-000000000503','90000000-0000-4000-8000-000000000501','Synthetic allocation customer');
insert into public.leader_orders(id,owner_id,client_id,project_name,client_total) values
 ('90000000-0000-4000-8000-000000000504','90000000-0000-4000-8000-000000000501','90000000-0000-4000-8000-000000000503','Synthetic source order',100),
 ('90000000-0000-4000-8000-000000000505','90000000-0000-4000-8000-000000000501','90000000-0000-4000-8000-000000000503','Synthetic target order',100);
insert into public.leader_payments(id,owner_id,order_id,amount,method,payment_date,payment_status,payment_type,is_confirmed)
 values('90000000-0000-4000-8000-000000000506','90000000-0000-4000-8000-000000000501','90000000-0000-4000-8000-000000000504',150,'Наличные','2026-10-28','Проведён','Приход',true);
set local role service_role;
do $$
declare actor uuid:='90000000-0000-4000-8000-000000000501';source_id uuid:='90000000-0000-4000-8000-000000000504';target_id uuid:='90000000-0000-4000-8000-000000000505';
 cmd jsonb;r jsonb;refund_id uuid;allocation_id uuid;rev timestamptz;target_rev timestamptz;
begin
 if has_function_privilege('authenticated','public.leader_finance_adjustment_rpc(jsonb)','EXECUTE') then raise exception 'financial_rpc_exposed';end if;
 select updated_at into rev from public.leader_orders where id=source_id;
 cmd:=jsonb_build_object('operation','refund','request_id',gen_random_uuid(),'payload',jsonb_build_object('order_id',source_id,'expected_updated_at',rev,'payment_id','90000000-0000-4000-8000-000000000506','amount',20,'date','2026-10-28','method','Наличные','reason','Synthetic actual refund'));
 r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id','90000000-0000-4000-8000-000000000502','request',cmd));if r->'error'->>'code' is distinct from 'forbidden' then raise exception 'manager_finance %',r;end if;
 r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'ok' is distinct from 'true' or (r->>'net')::numeric<>130 then raise exception 'refund %',r;end if;refund_id:=(r->>'adjustment_id')::uuid;
 r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'replay' is distinct from 'true' then raise exception 'refund_replay %',r;end if;
 r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id',actor,'request',cmd||jsonb_build_object('payload',(cmd->'payload')||jsonb_build_object('amount',21))));if r->'error'->>'code' is distinct from 'idempotency_conflict' then raise exception 'refund_conflict %',r;end if;
 select updated_at into rev from public.leader_orders where id=source_id;select updated_at into target_rev from public.leader_orders where id=target_id;
 cmd:=jsonb_build_object('operation','allocate','request_id',gen_random_uuid(),'payload',jsonb_build_object('order_id',source_id,'expected_updated_at',rev,'target_order_id',target_id,'expected_target_updated_at',target_rev,'amount',31,'date','2026-10-28','reason','Synthetic allocation'));
 r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->'error'->>'code' is distinct from 'allocation_exceeds_overpayment' then raise exception 'allocation_cap %',r;end if;
 cmd:=jsonb_set(cmd,'{payload,amount}','30');r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'ok' is distinct from 'true' then raise exception 'allocate %',r;end if;allocation_id:=(r->>'adjustment_id')::uuid;
 if leader_private.leader_finance_net_v1(source_id)<>100 or leader_private.leader_finance_net_v1(target_id)<>30 then raise exception 'allocation_not_atomic';end if;
 begin
  update public.leader_payments set payment_status='Отменён' where id='90000000-0000-4000-8000-000000000506';
  raise exception 'protected_payment_was_cancelled';
 exception when others then if SQLERRM<>'cancel_finance_adjustment_first' then raise;end if;end;
 select updated_at into rev from public.leader_orders where id=source_id;
 cmd:=jsonb_build_object('operation','void','request_id',gen_random_uuid(),'payload',jsonb_build_object('order_id',source_id,'expected_updated_at',rev,'adjustment_id',allocation_id,'reason','Synthetic allocation correction'));
 r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'ok' is distinct from 'true' then raise exception 'allocation_void %',r;end if;
 if leader_private.leader_finance_net_v1(source_id)<>130 or leader_private.leader_finance_net_v1(target_id)<>0 then raise exception 'allocation_void_not_paired';end if;
 insert into public.leader_expenses(id,owner_id,order_id,amount,expense_date,category,status) values('90000000-0000-4000-8000-000000000507',actor,source_id,10,now(),'Материалы','Проведён');
 select updated_at into rev from public.leader_orders where id=source_id;
 cmd:=jsonb_build_object('operation','expenses.confirm','request_id',gen_random_uuid(),'payload',jsonb_build_object('order_id',source_id,'expected_updated_at',rev,'confirmed',true,'reason','Synthetic all expenses recorded'));
 r:=public.leader_finance_adjustment_rpc(jsonb_build_object('actor_id',actor,'request',cmd));if r->>'ok' is distinct from 'true' then raise exception 'expense_confirm %',r;end if;
 if not exists(select from leader_private.leader_expense_confirmations where order_id=source_id and confirmed_at is not null) then raise exception 'expense_confirmation_missing';end if;
 update public.leader_expenses set amount=11 where id='90000000-0000-4000-8000-000000000507';
 if exists(select from leader_private.leader_expense_confirmations where order_id=source_id and confirmed_at is not null) then raise exception 'expense_confirmation_survived_change';end if;
end $$;
reset role;
rollback;
select jsonb_build_object('finance_adjustments_acceptance',true,'fixture_profiles',(select count(*) from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-0000000005%'),'fixture_orders',(select count(*) from public.leader_orders where id in ('90000000-0000-4000-8000-000000000504','90000000-0000-4000-8000-000000000505')));
