-- Real refunds, paired overpayment allocation, and explicit expense completeness.
-- Additive package: no existing money or canonical roles are rewritten.
begin;
set local lock_timeout='5s';set local statement_timeout='45s';
do $$ begin
 if to_regprocedure('public.leader_write_finance_rpc(jsonb)') is null then raise exception 'finance_writer_required';end if;
 if to_regclass('leader_private.leader_finance_adjustments') is not null then raise exception 'finance_adjustments_already_present';end if;
end $$;
create table leader_private.leader_finance_adjustments (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('refund','allocation')),
 source_order_id uuid not null references public.leader_orders(id) on delete restrict,
 target_order_id uuid references public.leader_orders(id) on delete restrict,
 source_payment_id uuid references public.leader_payments(id) on delete restrict,
 outgoing_payment_id uuid not null references public.leader_payments(id) on delete restrict,
 incoming_payment_id uuid references public.leader_payments(id) on delete restrict,
 amount numeric(14,2) not null check(amount>0),state text not null default 'posted' check(state in ('posted','void')),
 reason text not null,created_by uuid not null,created_at timestamptz not null default now(),voided_by uuid,voided_at timestamptz,
 check((kind='refund' and source_payment_id is not null and target_order_id is null and incoming_payment_id is null) or
  (kind='allocation' and target_order_id is not null and target_order_id<>source_order_id and incoming_payment_id is not null))
);
create index leader_finance_adjustments_source on leader_private.leader_finance_adjustments(source_order_id,created_at desc);
create index leader_finance_adjustments_target on leader_private.leader_finance_adjustments(target_order_id) where target_order_id is not null;
create index leader_finance_adjustments_payment on leader_private.leader_finance_adjustments(source_payment_id) where source_payment_id is not null;
create table leader_private.leader_expense_confirmations (
 order_id uuid primary key references public.leader_orders(id) on delete restrict,
 confirmed_by uuid not null,confirmed_at timestamptz,expense_hash text not null,reason text not null
);
create table leader_private.leader_finance_adjustment_receipts (
 actor_id uuid not null,request_id uuid not null,request jsonb not null,response jsonb not null,
 created_at timestamptz not null default now(),primary key(actor_id,request_id)
);
create table leader_private.leader_finance_adjustment_events (
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.leader_orders(id) on delete restrict,
 adjustment_id uuid references leader_private.leader_finance_adjustments(id),action text not null,
 reason text not null,actor_id uuid,created_at timestamptz not null default now()
);
do $$ declare t text;begin
 foreach t in array array['leader_finance_adjustments','leader_expense_confirmations','leader_finance_adjustment_receipts','leader_finance_adjustment_events'] loop
  execute format('alter table leader_private.%I enable row level security',t);
  execute format('revoke all on leader_private.%I from public,anon,authenticated',t);
  execute format('create policy leader_finance_adjustments_service on leader_private.%I to service_role using(true) with check(true)',t);
 end loop;
end $$;
grant select,insert,update on leader_private.leader_finance_adjustments,leader_private.leader_expense_confirmations to service_role;
grant select,insert on leader_private.leader_finance_adjustment_receipts,leader_private.leader_finance_adjustment_events to service_role;

create function leader_private.leader_finance_net_v1(p_order uuid)
returns numeric language sql stable security invoker set search_path='' as $$
 select coalesce(sum(case when lower(coalesce(payment_type,''))~'(возврат|расход|исход)' then -abs(amount) else abs(amount) end),0)
 from public.leader_payments where order_id=p_order and is_confirmed and lower(btrim(payment_status)) in ('проведён','проведен','posted');
$$;
create function leader_private.leader_expense_hash_v1(p_order uuid)
returns text language sql stable security invoker set search_path='' as $$
 select encode(extensions.digest(coalesce(jsonb_agg(jsonb_build_object('id',id,'amount',amount,'status',status,'updated_at',updated_at) order by id),'[]')::text,'sha256'),'hex')
 from public.leader_expenses where order_id=p_order;
$$;
create function leader_private.leader_finance_adjustment_payment_guard()
returns trigger language plpgsql security invoker set search_path='' set lock_timeout='3s' as $$
begin
 if current_setting('leader.finance_adjustment_write',true) is distinct from 'on' and exists(select from leader_private.leader_finance_adjustments
  where state='posted' and old.id in (source_payment_id,outgoing_payment_id,incoming_payment_id)) then
  raise exception 'cancel_finance_adjustment_first';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger leader_finance_adjustment_payment_guard before update or delete on public.leader_payments
 for each row execute function leader_private.leader_finance_adjustment_payment_guard();
create function leader_private.leader_expense_confirmation_invalidate()
returns trigger language plpgsql security invoker set search_path='' set lock_timeout='3s' as $$
declare affected uuid;begin
 for affected in select distinct x from unnest(case when tg_op='INSERT' then array[new.order_id] when tg_op='DELETE' then array[old.order_id] else array[old.order_id,new.order_id] end) x where x is not null loop
  update leader_private.leader_expense_confirmations set confirmed_at=null where order_id=affected and confirmed_at is not null;
  if found then insert into leader_private.leader_finance_adjustment_events(order_id,action,reason) values(affected,'expenses.reopened','Состав расходов изменился после подтверждения');end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger leader_expense_confirmation_invalidate after insert or update or delete on public.leader_expenses
 for each row execute function leader_private.leader_expense_confirmation_invalidate();

create function public.leader_finance_adjustment_rpc(p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' set lock_timeout='3s' as $$
declare actor uuid:=(p_payload->>'actor_id')::uuid;cmd jsonb:=p_payload->'request';op text:=cmd->>'operation';input_data jsonb:=cmd->'payload';req uuid;
 receipt leader_private.leader_finance_adjustment_receipts;adj leader_private.leader_finance_adjustments;
 source_ord public.leader_orders;target_ord public.leader_orders;payment public.leader_payments;
 source_id uuid:=(input_data->>'order_id')::uuid;target_id uuid;amount_value numeric;reason_value text;date_value date;method_value text;
 net_value numeric;available numeric;adjustment_id uuid;out_id uuid;in_id uuid;result jsonb;rows_value jsonb;oid uuid;
begin
 if actor is null or jsonb_typeof(cmd) is distinct from 'object' or jsonb_typeof(input_data) is distinct from 'object' or octet_length(cmd::text)>32768 or exists(select from jsonb_object_keys(cmd) k where k not in ('operation','request_id','payload')) then raise exception 'invalid_payload';end if;
 if not leader_private.leader_actor_has_crm_action(actor,case when op in ('options','closures') then 'finance.read' else 'finance.write' end) then raise exception 'forbidden';end if;
 if op='closures' then
  if jsonb_typeof(input_data->'order_ids') is distinct from 'array' or jsonb_array_length(input_data->'order_ids')>250 then raise exception 'invalid_payload';end if;
  select coalesce(jsonb_agg(jsonb_build_object('order_id',c.order_id,'confirmed',c.confirmed_at is not null and c.expense_hash=leader_private.leader_expense_hash_v1(c.order_id),'confirmed_at',c.confirmed_at)),'[]') into rows_value
   from leader_private.leader_expense_confirmations c where input_data->'order_ids' ? c.order_id::text;
  return jsonb_build_object('ok',true,'rows',rows_value);
 end if;
 if op='options' then
  select * into source_ord from public.leader_orders where id=source_id;
  if not found then raise exception 'not_found';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'order_number',order_number,'project_name',project_name,'updated_at',updated_at,'debt',greatest(client_total-leader_private.leader_finance_net_v1(id),0)) order by created_at desc),'[]') into rows_value
   from (select * from public.leader_orders where client_id=source_ord.client_id and id<>source_id and not is_archived order by created_at desc limit 100) t;
  return jsonb_build_object('ok',true,'targets',rows_value,'net',leader_private.leader_finance_net_v1(source_id),'overpayment',greatest(leader_private.leader_finance_net_v1(source_id)-source_ord.client_total,0),
   'adjustments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount',amount,'state',state,'source_order_id',source_order_id,'target_order_id',target_order_id,'reason',reason,'created_at',created_at) order by created_at desc) from leader_private.leader_finance_adjustments where source_order_id=source_id or target_order_id=source_id),'[]'),
   'protected_payment_ids',coalesce((select jsonb_agg(distinct p) from leader_private.leader_finance_adjustments a cross join lateral unnest(array[source_payment_id,outgoing_payment_id,incoming_payment_id]) p where state='posted' and (source_order_id=source_id or target_order_id=source_id) and p is not null),'[]'),
   'expenses_confirmed',coalesce((select confirmed_at is not null and expense_hash=leader_private.leader_expense_hash_v1(source_id) from leader_private.leader_expense_confirmations where order_id=source_id),false));
 end if;
 if op not in ('refund','allocate','void','expenses.confirm') or source_id is null then raise exception 'invalid_payload';end if;
 req:=(cmd->>'request_id')::uuid;if req is null then raise exception 'invalid_payload';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||req::text,281029));
 select * into receipt from leader_private.leader_finance_adjustment_receipts where actor_id=actor and request_id=req;
 if found then
  if receipt.request is distinct from cmd then raise exception 'idempotency_conflict';end if;
  return receipt.response||jsonb_build_object('replay',true);
 end if;
 reason_value:=btrim(coalesce(input_data->>'reason',''));if length(reason_value) not between 3 and 2000 then raise exception 'reason_required';end if;
 if op='void' then
  select * into adj from leader_private.leader_finance_adjustments where id=(input_data->>'adjustment_id')::uuid and source_order_id=source_id;
  if not found then raise exception 'not_found';end if;target_id:=adj.target_order_id;
 elsif op='allocate' then target_id:=(input_data->>'target_order_id')::uuid;if target_id is null or target_id=source_id then raise exception 'invalid_payload';end if;
 end if;
 -- Every multi-order operation takes order locks in UUID order.
 perform id from public.leader_orders where id in (source_id,target_id) order by id for update;
 select * into source_ord from public.leader_orders where id=source_id;
 if not found or source_ord.is_archived then raise exception 'not_found';end if;
 if (input_data->>'expected_updated_at')::timestamptz is distinct from source_ord.updated_at then raise exception 'source_changed';end if;
 if target_id is not null then
  select * into target_ord from public.leader_orders where id=target_id;
  if not found or target_ord.is_archived then raise exception 'not_found';end if;
  if op='allocate' and (input_data->>'expected_target_updated_at')::timestamptz is distinct from target_ord.updated_at then raise exception 'source_changed';end if;
 end if;
 if op in ('refund','allocate') then
  if jsonb_typeof(input_data->'amount') is distinct from 'number' then raise exception 'invalid_payload';end if;
  amount_value:=(input_data->>'amount')::numeric;date_value:=(input_data->>'date')::date;
  if amount_value is null or amount_value<=0 or amount_value>1000000000 or amount_value<>round(amount_value,2) or date_value is null or date_value<'2000-01-01' or date_value>(current_timestamp at time zone 'Europe/Moscow')::date then raise exception 'invalid_payload';end if;
  adjustment_id:=gen_random_uuid();out_id:=gen_random_uuid();
  if op='refund' then
   method_value:=input_data->>'method';if method_value is null or method_value not in ('Наличные','Перевод','Безналичный расчёт','Карта','Другое') then raise exception 'invalid_payload';end if;
   select * into payment from public.leader_payments where id=(input_data->>'payment_id')::uuid and order_id=source_id for update;
   if not found or not payment.is_confirmed or lower(btrim(payment.payment_status)) not in ('проведён','проведен','posted') or lower(coalesce(payment.payment_type,''))~'(возврат|расход|исход)' or payment.related_entity_type in ('allocation_in','allocation_out','refund') then raise exception 'invalid_source_payment';end if;
   select payment.amount-coalesce(sum(amount),0) into available from leader_private.leader_finance_adjustments where source_payment_id=payment.id and kind='refund' and state='posted';
   if amount_value>available or amount_value>leader_private.leader_finance_net_v1(source_id) then raise exception 'refund_exceeds_receipts';end if;
  else
   if source_ord.client_id is null or target_ord.client_id is distinct from source_ord.client_id then raise exception 'same_client_required';end if;
   if amount_value>greatest(leader_private.leader_finance_net_v1(source_id)-source_ord.client_total,0) then raise exception 'allocation_exceeds_overpayment';end if;
   if amount_value>greatest(target_ord.client_total-leader_private.leader_finance_net_v1(target_id),0) then raise exception 'allocation_exceeds_debt';end if;
   method_value:='Внутренний перенос';in_id:=gen_random_uuid();
  end if;
  insert into public.leader_payments(id,owner_id,order_id,amount,method,payment_date,comment,payment_status,created_by,payment_type,finance_category,related_entity_type,related_entity_id,is_confirmed)
   values(out_id,actor,source_id,amount_value,method_value,date_value,reason_value,'Проведён',actor,case when op='refund' then 'Возврат' else 'Исходящий перенос' end,case when op='refund' then 'Возврат клиенту' else 'Перенос переплаты' end,case when op='refund' then 'refund' else 'allocation_out' end,adjustment_id,true);
  if op='allocate' then
   insert into public.leader_payments(id,owner_id,order_id,amount,method,payment_date,comment,payment_status,created_by,payment_type,finance_category,related_entity_type,related_entity_id,is_confirmed)
    values(in_id,actor,target_id,amount_value,method_value,date_value,reason_value,'Проведён',actor,'Приход','Перенос переплаты','allocation_in',adjustment_id,true);
  end if;
  insert into leader_private.leader_finance_adjustments(id,kind,source_order_id,target_order_id,source_payment_id,outgoing_payment_id,incoming_payment_id,amount,reason,created_by)
   values(adjustment_id,case when op='refund' then 'refund' else 'allocation' end,source_id,target_id,case when op='refund' then payment.id else null end,out_id,in_id,amount_value,reason_value,actor) returning * into adj;
 elsif op='void' then
  select * into adj from leader_private.leader_finance_adjustments where id=adj.id for update;
  if adj.state<>'posted' then raise exception 'already_void';end if;
  if adj.kind='allocation' and leader_private.leader_finance_net_v1(target_id)<adj.amount then raise exception 'allocation_already_used';end if;
  perform set_config('leader.finance_adjustment_write','on',true);
  update public.leader_payments set payment_status='Отменён',updated_at=clock_timestamp() where id in (adj.outgoing_payment_id,adj.incoming_payment_id);
  perform set_config('leader.finance_adjustment_write','off',true);
  update leader_private.leader_finance_adjustments set state='void',voided_by=actor,voided_at=now() where id=adj.id;
 else
  if input_data->>'confirmed' is distinct from 'true' then raise exception 'expense_confirmation_required';end if;
  if exists(select from public.leader_expenses where order_id=source_id and lower(btrim(status)) not in ('проведён','проведен','posted','отменён','отменен','cancelled')) then raise exception 'expenses_unresolved';end if;
  insert into leader_private.leader_expense_confirmations(order_id,confirmed_by,confirmed_at,expense_hash,reason) values(source_id,actor,now(),leader_private.leader_expense_hash_v1(source_id),reason_value)
   on conflict(order_id) do update set confirmed_by=actor,confirmed_at=now(),expense_hash=excluded.expense_hash,reason=excluded.reason;
 end if;
 if op<>'expenses.confirm' then
  foreach oid in array array[source_id,target_id] loop
   if oid is null then continue;end if;net_value:=leader_private.leader_finance_net_v1(oid);
   update public.leader_orders set prepayment=net_value,balance=greatest(client_total-net_value,0),payment_status=case when net_value>=client_total then 'Оплачено' when net_value>0 then 'Частично оплачено' else 'Не оплачено' end,updated_at=clock_timestamp() where id=oid;
  end loop;
 end if;
 insert into leader_private.leader_finance_adjustment_events(order_id,adjustment_id,action,reason,actor_id) values(source_id,adj.id,op,reason_value,actor);
 result:=jsonb_build_object('ok',true,'adjustment_id',adj.id,'order_id',source_id,'net',leader_private.leader_finance_net_v1(source_id));
 insert into leader_private.leader_finance_adjustment_receipts(actor_id,request_id,request,response) values(actor,req,cmd,result);
 return result;
exception when others then
 return jsonb_build_object('ok',false,'error',jsonb_build_object('code',case when SQLERRM in ('forbidden','invalid_payload','idempotency_conflict','source_changed','reason_required','not_found','invalid_source_payment','refund_exceeds_receipts','same_client_required','allocation_exceeds_overpayment','allocation_exceeds_debt','already_void','allocation_already_used','expense_confirmation_required','expenses_unresolved') then SQLERRM when SQLSTATE in ('22P02','22007','22008','22003','23502','23503','23514') then 'invalid_payload' else 'finance_adjustment_failed' end));
end $$;
revoke all on function leader_private.leader_finance_net_v1(uuid),leader_private.leader_expense_hash_v1(uuid),leader_private.leader_finance_adjustment_payment_guard(),leader_private.leader_expense_confirmation_invalidate(),public.leader_finance_adjustment_rpc(jsonb) from public,anon,authenticated;
grant execute on function leader_private.leader_finance_net_v1(uuid),leader_private.leader_expense_hash_v1(uuid),public.leader_finance_adjustment_rpc(jsonb) to service_role;
commit;
