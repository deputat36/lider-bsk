
with scope as (
 select c.oid,n.nspname schema,c.relname name
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p') and ((n.nspname='public' and left(c.relname,7)='leader_') or left(n.nspname,7)='leader_')
)
select jsonb_build_object(
 'indexes',(select coalesce(jsonb_agg(jsonb_build_object('schema',s.schema,'table',s.name,'name',ci.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid) order by s.schema,s.name,ci.relname),'[]') from scope s join pg_index i on i.indrelid=s.oid join pg_class ci on ci.oid=i.indexrelid),
 'triggers',(select coalesce(jsonb_agg(jsonb_build_object('schema',s.schema,'table',s.name,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) order by s.schema,s.name,t.tgname),'[]') from scope s join pg_trigger t on t.tgrelid=s.oid where not t.tgisinternal),
 'views',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'definition',pg_get_viewdef(c.oid,true)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('v','m') and ((n.nspname='public' and left(c.relname,7)='leader_') or left(n.nspname,7)='leader_')),
 'table_grants',(select coalesce(jsonb_agg(jsonb_build_object('schema',s.schema,'table',s.name,'role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by s.schema,s.name,a.grantee,a.privilege_type),'[]') from scope s join pg_class c on c.oid=s.oid cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
 'column_grants',(select coalesce(jsonb_agg(jsonb_build_object('schema',s.schema,'table',s.name,'column',at.attname,'role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type) order by s.schema,s.name,at.attname,a.grantee),'[]') from scope s join pg_attribute at on at.attrelid=s.oid cross join lateral aclexplode(at.attacl) a where at.attnum>0 and not at.attisdropped),
 'function_grants',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),'role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type) order by n.nspname,p.proname,a.grantee),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.prokind in ('f','p') and ((n.nspname='public' and left(p.proname,7)='leader_') or left(n.nspname,7)='leader_'))
) as result;
