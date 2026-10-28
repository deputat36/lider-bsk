-- Native RLS simulation, not an Auth/UI login. Every fixture is rolled back.
begin;
do $$ begin
 if exists(select from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-00000000049%') then raise exception 'role_policy_fixture_collision';end if;
end $$;
insert into public.leader_user_profiles(user_id,role,is_active,full_name) values
 ('90000000-0000-4000-8000-000000000491','owner',true,'Synthetic RLS owner'),
 ('90000000-0000-4000-8000-000000000492','contractor',true,'Synthetic RLS contractor'),
 ('90000000-0000-4000-8000-000000000493','manager',true,'Synthetic RLS manager');
update public.leader_user_profiles set is_active=true,role=case user_id when '90000000-0000-4000-8000-000000000491' then 'owner' when '90000000-0000-4000-8000-000000000492' then 'contractor' else 'manager' end
 where user_id in ('90000000-0000-4000-8000-000000000491','90000000-0000-4000-8000-000000000492','90000000-0000-4000-8000-000000000493');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000491"}',true);
set local role authenticated;
insert into public.leader_leads(id,name,message,status) values('90000000-0000-4000-8000-000000000494','Synthetic RLS owner lead','Synthetic role proof','Новая');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000493"}',true);
insert into public.leader_leads(id,name,message,status) values('90000000-0000-4000-8000-000000000495','Synthetic RLS manager lead','Synthetic role proof','Новая');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000492"}',true);
do $$ declare changed integer;begin
 if exists(select from public.leader_leads where id in ('90000000-0000-4000-8000-000000000494','90000000-0000-4000-8000-000000000495')) then raise exception 'contractor_reads_leads';end if;
 begin
  insert into public.leader_leads(id,name,message,status) values('90000000-0000-4000-8000-000000000496','Synthetic forbidden lead','Synthetic role proof','Новая');
  raise exception 'contractor_creates_leads';
 exception when insufficient_privilege then null;end;
 update public.leader_leads set message='Synthetic forbidden change' where id='90000000-0000-4000-8000-000000000494';get diagnostics changed=row_count;
 if changed<>0 then raise exception 'contractor_updates_leads';end if;
end $$;
reset role;
rollback;
select jsonb_build_object('lead_role_policy_proof',true,'fixture_profiles',(select count(*) from public.leader_user_profiles where user_id::text like '90000000-0000-4000-8000-00000000049%'),'fixture_leads',(select count(*) from public.leader_leads where id::text like '90000000-0000-4000-8000-00000000049%'));
