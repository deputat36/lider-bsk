-- Staging-only safe design queue projection. No production activation.
DO $guard$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM leader_staging.environment_guard WHERE singleton=true AND project_ref='otulfnouybahfnsycxqn') THEN RAISE EXCEPTION 'staging_environment_guard_failed';END IF;
 IF has_table_privilege('authenticated','public.leader_design_tasks','INSERT') OR has_any_column_privilege('authenticated','public.leader_design_tasks','UPDATE') THEN RAISE EXCEPTION 'design_direct_writes_not_closed';END IF;
END $guard$;
GRANT SELECT(id,order_id,title,task_status,priority,deadline,designer_name,task_text,layout_link,reference_link) ON public.leader_design_tasks TO authenticated;
