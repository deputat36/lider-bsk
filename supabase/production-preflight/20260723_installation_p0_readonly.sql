-- READ-ONLY PRODUCTION PREFLIGHT.
-- Target: lider-bsk production / ofewxuqfjhamgerwzull.
-- This file contains SELECT/CTE statements only. It must never mutate production.

with required(table_name,column_name) as (
  values
    ('leader_user_profiles','user_id'),('leader_user_profiles','role'),('leader_user_profiles','is_active'),
    ('leader_orders','id'),('leader_orders','order_number'),('leader_orders','project_name'),('leader_orders','status'),('leader_orders','installation_status'),('leader_orders','layout_link'),('leader_orders','installation_address'),('leader_orders','installation_scheduled_at'),('leader_orders','installation_completed_at'),('leader_orders','installer_name'),('leader_orders','installer_phone'),('leader_orders','current_stage'),('leader_orders','stage_updated_at'),('leader_orders','updated_at'),
    ('leader_production_jobs','id'),('leader_production_jobs','title'),('leader_production_jobs','production_status'),('leader_production_jobs','layout_status'),('leader_production_jobs','priority'),('leader_production_jobs','deadline'),('leader_production_jobs','ready_at'),('leader_production_jobs','file_url'),('leader_production_jobs','technical_task'),('leader_production_jobs','updated_at'),
    ('leader_installation_jobs','id'),('leader_installation_jobs','order_id'),('leader_installation_jobs','production_job_id'),('leader_installation_jobs','title'),('leader_installation_jobs','install_status'),('leader_installation_jobs','priority'),('leader_installation_jobs','installer_name'),('leader_installation_jobs','installer_phone'),('leader_installation_jobs','address'),('leader_installation_jobs','scheduled_at'),('leader_installation_jobs','started_at'),('leader_installation_jobs','completed_at'),('leader_installation_jobs','accepted_at'),('leader_installation_jobs','technical_task'),('leader_installation_jobs','tools_required'),('leader_installation_jobs','installer_comment'),('leader_installation_jobs','result_comment'),('leader_installation_jobs','before_photo_url'),('leader_installation_jobs','after_photo_url'),('leader_installation_jobs','created_at'),('leader_installation_jobs','created_by'),('leader_installation_jobs','updated_at'),('leader_installation_jobs','updated_by'),
    ('leader_installation_job_items','id'),('leader_installation_job_items','job_id'),('leader_installation_job_items','name'),('leader_installation_job_items','unit'),('leader_installation_job_items','qty'),('leader_installation_job_items','width'),('leader_installation_job_items','height'),('leader_installation_job_items','comment'),('leader_installation_job_items','created_at'),
    ('leader_installation_events','id'),('leader_installation_events','job_id'),('leader_installation_events','order_id'),('leader_installation_events','event_type'),('leader_installation_events','old_status'),('leader_installation_events','new_status'),('leader_installation_events','body'),('leader_installation_events','created_by'),('leader_installation_events','created_at'),
    ('leader_installation_comments','id'),('leader_installation_comments','job_id'),('leader_installation_comments','comment_type'),('leader_installation_comments','body'),('leader_installation_comments','created_at')
), missing as (
  select r.table_name, r.column_name
  from required r
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = r.table_name
      and c.column_name = r.column_name
  )
), roles as (
  select coalesce(jsonb_object_agg(role, cnt), '{}'::jsonb) as value
  from (
    select lower(btrim(role)) as role, count(*)::int as cnt
    from public.leader_user_profiles
    group by lower(btrim(role))
    order by lower(btrim(role))
  ) x
)
select jsonb_build_object(
  'project_ref', 'ofewxuqfjhamgerwzull',
  'captured_at', now(),
  'roles', (select value from roles),
  'rows', jsonb_build_object(
    'profiles', (select count(*) from public.leader_user_profiles),
    'orders', (select count(*) from public.leader_orders),
    'installation_jobs', (select count(*) from public.leader_installation_jobs),
    'installation_items', (select count(*) from public.leader_installation_job_items),
    'installation_events', (select count(*) from public.leader_installation_events),
    'installation_comments', (select count(*) from public.leader_installation_comments)
  ),
  'required_columns_total', (select count(*) from required),
  'missing_required_columns', coalesce((
    select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name) order by table_name, column_name)
    from missing
  ), '[]'::jsonb),
  'components', jsonb_build_object(
    'role_action_matrix', to_regclass('leader_private.leader_role_action_matrix_v1') is not null,
    'command_receipts', to_regclass('leader_private.leader_command_receipts') is not null,
    'actor_permission_function', to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is not null,
    'actor_permission_rpc', to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') is not null,
    'installation_read_rpc', to_regprocedure('public.leader_read_installation_job_rpc(uuid,uuid)') is not null,
    'installation_update_rpc', to_regprocedure('public.leader_update_installation_job_rpc(jsonb)') is not null,
    'staging_environment_guard', to_regclass('leader_staging.environment_guard') is not null
  )
) as installation_p0_snapshot;
