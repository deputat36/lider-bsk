-- Leader-only read activation. Owner authorization 2026-09-29 / renewed 2026-10-03.
-- No business-row writes, Edge/Auth/Storage deployment or shared-core replacement.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $preflight$ BEGIN
 IF to_regclass('leader_staging.environment_guard') IS NOT NULL THEN RAISE EXCEPTION 'production_only';END IF;
 IF to_regprocedure('leader_private.leader_has_crm_action(text)') IS NULL THEN RAISE EXCEPTION 'canonical_read_helper_missing';END IF;
 IF has_table_privilege('authenticated','leader_private.leader_rollout_backups','SELECT') OR has_table_privilege('service_role','leader_private.leader_rollout_backups','SELECT') THEN RAISE EXCEPTION 'backup_exposed';END IF;
 IF EXISTS(SELECT 1 FROM leader_private.leader_rollout_backups WHERE id='design-read-20261003-v1') THEN RAISE EXCEPTION 'already_installed';END IF;
END $preflight$;
LOCK TABLE public.leader_design_tasks IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO leader_private.leader_rollout_backups(id,project_ref,data_snapshot,metadata_snapshot,edge_snapshot)
SELECT 'design-read-20261003-v1','ofewxuqfjhamgerwzull',jsonb_build_object('leader_design_tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_design_tasks t)),jsonb_build_object(
 'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public' AND tablename='leader_design_tasks'),
 'table',(SELECT jsonb_build_object('acl',relacl,'rls',relrowsecurity) FROM pg_class WHERE oid='public.leader_design_tasks'::regclass),
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'acl',attacl)) FROM pg_attribute WHERE attrelid='public.leader_design_tasks'::regclass AND attnum>0 AND NOT attisdropped)), '{}'::jsonb;
REVOKE ALL ON TABLE public.leader_design_tasks FROM PUBLIC,anon,authenticated;
DO $columns$ DECLARE names text;BEGIN
 SELECT string_agg(format('%I',attname),',' ORDER BY attnum) INTO names FROM pg_attribute WHERE attrelid='public.leader_design_tasks'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON TABLE public.leader_design_tasks FROM PUBLIC,anon,authenticated',names,names,names,names);
END $columns$;
GRANT SELECT(id,order_id,title,task_status,layout_status,priority,deadline,designer_name,task_text,layout_link,reference_link,created_at,updated_at) ON public.leader_design_tasks TO authenticated;
ALTER TABLE public.leader_design_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY leader_design_tasks_canonical_read_v1 ON public.leader_design_tasks AS RESTRICTIVE FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('design.read')));
CREATE POLICY leader_design_tasks_canonical_read_allow_v1 ON public.leader_design_tasks FOR SELECT TO authenticated USING ((SELECT leader_private.leader_has_crm_action('design.read')));
DO $postflight$ BEGIN
 IF (SELECT data_snapshot->'leader_design_tasks' FROM leader_private.leader_rollout_backups WHERE id='design-read-20261003-v1') IS DISTINCT FROM (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.leader_design_tasks t) THEN RAISE EXCEPTION 'business_rows_changed';END IF;
 IF has_table_privilege('authenticated','public.leader_design_tasks','INSERT') OR has_any_column_privilege('authenticated','public.leader_design_tasks','UPDATE') OR has_column_privilege('authenticated','public.leader_design_tasks','client_phone','SELECT') OR has_column_privilege('anon','public.leader_design_tasks','id','SELECT') THEN RAISE EXCEPTION 'unsafe_design_acl';END IF;
END $postflight$;
COMMIT;
