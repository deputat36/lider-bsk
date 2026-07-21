-- STAGING ONLY. Rollback-safe acceptance for installation schema.
begin;

do $guard$
begin
  if not exists (
    select 1
    from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if to_regclass('public.leader_installation_jobs') is null
     or to_regclass('public.leader_installation_job_items') is null
     or to_regclass('public.leader_installation_events') is null
     or to_regclass('public.leader_installation_comments') is null then
    raise exception 'installation_schema_missing';
  end if;
end
$guard$;

do $test$
declare
  v_order_id uuid := gen_random_uuid();
  v_production_job_id uuid := gen_random_uuid();
  v_installation_job_id uuid := gen_random_uuid();
  v_item_id uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
  v_comment_id uuid := gen_random_uuid();
begin
  insert into public.leader_orders (
    id, project_name, installation_status, installation_address,
    installation_scheduled_at, installation_completed_at,
    installer_name, installer_phone, current_stage, stage_updated_at
  ) values (
    v_order_id, 'STAGING installation schema acceptance', 'Запланирован',
    'STAGING address', clock_timestamp() + interval '1 day', null,
    'STAGING installer', '+70000000000', 'Монтаж: Запланирован', clock_timestamp()
  );

  insert into public.leader_production_jobs (
    id, order_id, title, production_status
  ) values (
    v_production_job_id, v_order_id, 'STAGING production prerequisite', 'Готово'
  );

  insert into public.leader_installation_jobs (
    id, order_id, production_job_id, title, install_status, priority,
    installer_name, installer_phone, address, scheduled_at,
    technical_task, tools_required, installer_comment,
    before_photo_url, after_photo_url
  ) values (
    v_installation_job_id, v_order_id, v_production_job_id,
    'STAGING installation job', 'Запланирован', 'Обычный',
    'STAGING installer', '+70000000000', 'STAGING address',
    clock_timestamp() + interval '1 day', 'Synthetic task', 'Synthetic tools',
    'Synthetic comment', 'https://example.invalid/before', 'https://example.invalid/after'
  );

  insert into public.leader_installation_job_items (
    id, job_id, order_id, name, unit, qty, width, height,
    installer_price, client_price, comment
  ) values (
    v_item_id, v_installation_job_id, v_order_id,
    'Synthetic installation item', 'шт', 1, 100, 200,
    500, 800, 'Synthetic item comment'
  );

  insert into public.leader_installation_events (
    id, job_id, order_id, event_type, old_status, new_status, body
  ) values (
    v_event_id, v_installation_job_id, v_order_id,
    'status', 'Не назначен', 'Запланирован', 'Synthetic acceptance event'
  );

  insert into public.leader_installation_comments (
    id, job_id, comment_type, body
  ) values (
    v_comment_id, v_installation_job_id, 'internal', 'Synthetic acceptance comment'
  );

  if not exists (
    select 1 from public.leader_installation_jobs
    where id = v_installation_job_id
      and order_id = v_order_id
      and production_job_id = v_production_job_id
      and install_status = 'Запланирован'
  ) then
    raise exception 'installation_job_insert_failed';
  end if;

  if (select count(*) from public.leader_installation_job_items where job_id = v_installation_job_id) <> 1 then
    raise exception 'installation_item_insert_failed';
  end if;

  if (select count(*) from public.leader_installation_events where job_id = v_installation_job_id) <> 1 then
    raise exception 'installation_event_insert_failed';
  end if;

  if (select count(*) from public.leader_installation_comments where job_id = v_installation_job_id) <> 1 then
    raise exception 'installation_comment_insert_failed';
  end if;

  if has_table_privilege('anon', 'public.leader_installation_jobs', 'SELECT')
     or has_table_privilege('authenticated', 'public.leader_installation_jobs', 'SELECT')
     or has_table_privilege('authenticated', 'public.leader_installation_jobs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.leader_installation_job_items', 'SELECT') then
    raise exception 'browser_table_privilege_must_be_closed';
  end if;

  if not has_table_privilege('service_role', 'public.leader_installation_jobs', 'SELECT')
     or not has_table_privilege('service_role', 'public.leader_installation_jobs', 'INSERT')
     or not has_table_privilege('service_role', 'public.leader_installation_jobs', 'UPDATE')
     or not has_table_privilege('service_role', 'public.leader_installation_job_items', 'INSERT')
     or not has_table_privilege('service_role', 'public.leader_installation_events', 'INSERT')
     or not has_table_privilege('service_role', 'public.leader_installation_comments', 'INSERT') then
    raise exception 'service_role_table_privilege_missing';
  end if;

  delete from public.leader_installation_jobs where id = v_installation_job_id;

  if exists (select 1 from public.leader_installation_job_items where job_id = v_installation_job_id)
     or exists (select 1 from public.leader_installation_events where job_id = v_installation_job_id)
     or exists (select 1 from public.leader_installation_comments where job_id = v_installation_job_id) then
    raise exception 'installation_child_cascade_failed';
  end if;
end
$test$;

rollback;
