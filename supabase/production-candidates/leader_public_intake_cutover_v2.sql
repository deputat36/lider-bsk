-- Protected public intake ACL cutover. Keep historical policies for traceable recovery.
begin;
insert into leader_private.leader_rollout_backups(id,created_at,project_ref,data_snapshot,metadata_snapshot,edge_snapshot)
select 'public-intake-20261027-v2',now(),'ofewxuqfjhamgerwzull',
 jsonb_build_object('leads',(select count(*) from public.leader_leads),'audit',(select count(*) from public.leader_public_lead_audit)),
 jsonb_build_object('policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('leader_leads','leader_public_lead_audit')),
 '[]'::jsonb)
on conflict(id) do nothing;
revoke insert on public.leader_leads,public.leader_public_lead_audit from anon;
do $$ declare r record; begin
 for r in select c.relname,string_agg(quote_ident(a.attname),',') as cols from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped where n.nspname='public' and c.relname in ('leader_leads','leader_public_lead_audit') group by c.relname loop
  execute format('revoke insert (%s) on public.%I from anon',r.cols,r.relname);
 end loop;
end $$;
alter policy leader_leads_insert_public_safe on public.leader_leads to authenticated
with check (
 leader_private.leader_has_access()
 and coalesce(nullif(btrim(phone),''),nullif(btrim(message),'')) is not null
 and length(coalesce(name,''))<=200 and length(coalesce(phone,''))<=80
 and length(coalesce(message,''))<=3000 and length(coalesce(source,''))<=120
 and length(coalesce(service,''))<=200
);
do $$ begin
 if has_any_column_privilege('anon','public.leader_leads','INSERT') or has_any_column_privilege('anon','public.leader_public_lead_audit','INSERT') then raise exception 'anonymous write remains'; end if;
 if not has_table_privilege('authenticated','public.leader_leads','INSERT') then raise exception 'manual lead privilege lost';end if;
 if not has_table_privilege('service_role','public.leader_leads','INSERT') or not has_table_privilege('service_role','public.leader_public_lead_audit','INSERT') then raise exception 'server writer unavailable';end if;
end $$;
commit;

