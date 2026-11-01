
with leader_tables as (
 select c.oid,n.nspname schema,c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.reltuples::bigint estimated_rows,
 (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns,
 (select coalesce(jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid),'target_schema',tn.nspname,'target_table',tc.relname,'columns',(select jsonb_agg(ax.attname order by k.ordinality) from unnest(con.conkey) with ordinality k(attnum,ordinality) join pg_attribute ax on ax.attrelid=con.conrelid and ax.attnum=k.attnum),'target_columns',(select jsonb_agg(ax.attname order by k.ordinality) from unnest(con.confkey) with ordinality k(attnum,ordinality) join pg_attribute ax on ax.attrelid=con.confrelid and ax.attnum=k.attnum),'on_update',con.confupdtype,'on_delete',con.confdeltype,'match',con.confmatchtype,'deferrable',con.condeferrable,'initially_deferred',con.condeferred,'validated',con.convalidated) order by con.conname),'[]') from pg_constraint con left join pg_class tc on tc.oid=con.confrelid left join pg_namespace tn on tn.oid=tc.relnamespace where con.conrelid=c.oid) constraints
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p') and ((n.nspname='public' and left(c.relname,7)='leader_') or left(n.nspname,7)='leader_')
),
leader_functions as (
 select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) args,p.prosecdef security_definer,md5(pg_get_functiondef(p.oid)) source_md5
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind in ('f','p') and (n.nspname='public' and left(p.proname,7)='leader_' or left(n.nspname,7)='leader_')
)
select jsonb_build_object(
 'captured_at',clock_timestamp(),
 'project','ofewxuqfjhamgerwzull',
 'mode','schema metadata; data and encryption supplied by the snapshot wrapper',
 'tables',(select coalesce(jsonb_agg(to_jsonb(t.*)-'oid' order by t.name),'[]') from leader_tables t),
 'functions',(select coalesce(jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]') from leader_functions f),
 'sequences',(select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'type',format_type(s.seqtypid,null),'start',s.seqstart::text,'increment',s.seqincrement::text,'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle)),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_sequence s on s.seqrelid=c.oid where (n.nspname='public' and left(c.relname,7)='leader_') or n.nspname='leader_private'),
 'policies',(select coalesce(jsonb_agg(jsonb_build_object('schema',schemaname,'table',tablename,'name',policyname,'permissive',permissive,'roles',roles,'command',cmd,'using',qual,'check',with_check) order by tablename,policyname),'[]') from pg_policies where (schemaname='public' and left(tablename,7)='leader_') or left(schemaname,7)='leader_')
) as result;
