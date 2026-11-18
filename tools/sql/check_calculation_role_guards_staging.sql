-- Only otulfnouybahfnsycxqn. The caller must select that project explicitly.
-- Entire probe rolls back: no Auth users, committed fixtures, new grants or permissive policies.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $preflight$ begin
 if exists(select 1 from public.leader_lead_calculations) or exists(select 1 from public.leader_lead_calculation_items) then
  raise exception 'empty_staging_calculations_required';
 end if;
 if (select count(*) from pg_policies where schemaname='public' and policyname in
  ('leader_calculations_canonical_select_v1','leader_calculations_canonical_insert_v1','leader_calculations_canonical_update_v1','leader_calculations_canonical_delete_v1',
   'leader_calculation_items_canonical_select_v1','leader_calculation_items_canonical_insert_v1','leader_calculation_items_canonical_update_v1','leader_calculation_items_canonical_delete_v1'))<>8 then
  raise exception 'eight_restrictive_guards_required';
 end if;
end $preflight$;

-- Mirror production's legacy permissive path inside this rolled-back transaction.
-- These deliberately broad probe policies cannot survive either success or error.
grant select,insert,update,delete on public.leader_lead_calculations,public.leader_lead_calculation_items to authenticated;
create policy leader_calculations_legacy_probe on public.leader_lead_calculations
 as permissive for all to authenticated using(leader_private.leader_has_access()) with check(leader_private.leader_has_access());
create policy leader_items_legacy_probe on public.leader_lead_calculation_items
 as permissive for all to authenticated using(leader_private.leader_has_access()) with check(leader_private.leader_has_access());

do $probe$
declare
 original_role text:=current_user;
 marker text:='SYNTH-CALC-ROLE-GUARD-20261112';
 roles text[]:=array['owner','admin','manager','accountant','designer','installer','contractor','inactive','no_profile'];
 actor uuid; lead_id uuid:=gen_random_uuid(); calc_id uuid:=gen_random_uuid(); item_id uuid:=gen_random_uuid();
 new_calc uuid; new_item uuid; actor_role text; expected integer; n integer; version integer:=10; tests integer:=0;
begin
 insert into public.leader_leads(id,name,phone,status,payload)
  values(lead_id,marker,'79000000000','Новая','{"demo":true}'::jsonb);
 insert into public.leader_lead_calculations(id,lead_id,title,client_total,contractor_cost,profit)
  values(calc_id,lead_id,marker,10,5,5);
 insert into public.leader_lead_calculation_items(id,calculation_id,lead_id,name,qty,contractor_price,contractor_sum,client_price,client_sum,profit)
  values(item_id,calc_id,lead_id,marker,1,5,5,10,10,5);
 foreach actor_role in array roles loop
  actor:=gen_random_uuid();new_calc:=gen_random_uuid();new_item:=gen_random_uuid();version:=version+1;
  if actor_role<>'no_profile' then
   insert into public.leader_user_profiles(user_id,email,full_name,role,is_active)
    values(actor,actor::text||'@example.invalid',marker,case when actor_role='inactive' then 'owner' else actor_role end,actor_role<>'inactive');
  end if;
  expected:=case when actor_role=any(array['owner','admin','manager']) then 1 else 0 end;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  perform set_config('role','authenticated',true);

  select count(*) into n from public.leader_lead_calculations where id=calc_id;
  if n<>expected then raise exception 'calculation_select:% got%',actor_role,n;end if;tests:=tests+1;
  select count(*) into n from public.leader_lead_calculation_items where id=item_id;
  if n<>expected then raise exception 'item_select:% got%',actor_role,n;end if;tests:=tests+1;

  n:=0;
  begin
   insert into public.leader_lead_calculations(id,lead_id,title,version_number,is_current_revision,client_total,contractor_cost,profit)
    values(new_calc,lead_id,marker,version,false,10,5,5);get diagnostics n=row_count;
  exception when insufficient_privilege then n:=0;end;
  if n<>expected then raise exception 'calculation_insert:% got%',actor_role,n;end if;tests:=tests+1;
  n:=0;
  begin
   insert into public.leader_lead_calculation_items(id,calculation_id,lead_id,name,qty,contractor_price,contractor_sum,client_price,client_sum,profit)
    values(new_item,calc_id,lead_id,marker,1,5,5,10,10,5);get diagnostics n=row_count;
  exception when insufficient_privilege then n:=0;end;
  if n<>expected then raise exception 'item_insert:% got%',actor_role,n;end if;tests:=tests+1;

  update public.leader_lead_calculations set title=marker where id=calc_id;get diagnostics n=row_count;
  if n<>expected then raise exception 'calculation_update:% got%',actor_role,n;end if;tests:=tests+1;
  update public.leader_lead_calculation_items set name=marker where id=item_id;get diagnostics n=row_count;
  if n<>expected then raise exception 'item_update:% got%',actor_role,n;end if;tests:=tests+1;

  delete from public.leader_lead_calculation_items where id=case when expected=1 then new_item else item_id end;get diagnostics n=row_count;
  if n<>expected then raise exception 'item_delete:% got%',actor_role,n;end if;tests:=tests+1;
  delete from public.leader_lead_calculations where id=case when expected=1 then new_calc else calc_id end;get diagnostics n=row_count;
  if n<>expected then raise exception 'calculation_delete:% got%',actor_role,n;end if;tests:=tests+1;
  perform set_config('role',original_role,true);
 end loop;
 if tests<>72 then raise exception 'expected72_checks got%',tests;end if;
 if has_table_privilege('anon','public.leader_lead_calculations','SELECT') or has_table_privilege('anon','public.leader_lead_calculation_items','SELECT') then
  raise exception 'anon_select_must_be_revoked';
 end if;
end $probe$;
rollback;
select jsonb_build_object('ok',true,'checks',72,'roles',7,'extra_denials',array['inactive','no_profile','anon'],
 'calculations_after',(select count(*) from public.leader_lead_calculations),
 'items_after',(select count(*) from public.leader_lead_calculation_items),
 'fixture_profiles_after',(select count(*) from public.leader_user_profiles where full_name='SYNTH-CALC-ROLE-GUARD-20261112'),
 'probe_policies_after',(select count(*) from pg_policies where policyname in ('leader_calculations_legacy_probe','leader_items_legacy_probe'))) as proof;
