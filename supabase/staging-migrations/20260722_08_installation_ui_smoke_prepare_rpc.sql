-- STAGING ONLY.
-- Applied as 20260722203052 / staging_installation_ui_smoke_prepare_rpc_20260722.
-- Creates one synthetic installation fixture after the Auth user is created by
-- the OIDC-verified Edge bootstrap.

create or replace function public.leader_prepare_installation_ui_smoke_rpc(
  p_run_key text,
  p_user_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_run_key text := btrim(coalesce(p_run_key, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_order_id uuid := gen_random_uuid();
  v_production_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  if not exists (
    select 1 from leader_staging.environment_guard
    where singleton = true
      and project_ref = 'otulfnouybahfnsycxqn'
      and environment_name = 'staging'
      and repository = 'deputat36/lider-bsk'
  ) then
    raise exception 'staging_environment_guard_failed';
  end if;

  if v_run_key !~ '^[0-9]+:[0-9]+$' or p_user_id is null then
    raise exception 'fixture_identity_invalid';
  end if;
  if v_email = '' or char_length(v_email) > 320 or position('@' in v_email) < 2 then
    raise exception 'email_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('installation-ui-smoke:' || v_run_key, 0));

  if exists (select 1 from leader_staging.installation_ui_smoke_runs) then
    raise exception 'another_smoke_run_is_active';
  end if;
  if exists (select 1 from public.leader_user_profiles)
     or exists (select 1 from public.leader_orders)
     or exists (select 1 from public.leader_production_jobs)
     or exists (select 1 from public.leader_installation_jobs)
     or exists (select 1 from public.leader_installation_job_items)
     or exists (select 1 from public.leader_installation_events)
     or exists (select 1 from public.leader_installation_comments)
     or exists (select 1 from leader_private.leader_command_receipts where action = 'installation_job.update') then
    raise exception 'staging_fixture_tables_not_empty';
  end if;

  insert into public.leader_user_profiles (
    user_id, email, full_name, role, is_active, permissions
  ) values (
    p_user_id, v_email, 'Synthetic staging UI smoke', 'installer', true, '{}'::jsonb
  );

  insert into public.leader_orders (
    id, owner_id, project_name, client_name, client_phone, status, priority,
    client_total, contractor_cost, profit, prepayment, balance, production_status,
    internal_comment, data, current_stage, installation_status,
    installation_address, installation_scheduled_at, installer_name, installer_phone,
    created_at, updated_at, stage_updated_at
  ) values (
    v_order_id, p_user_id, 'UI smoke order ' || v_run_key,
    'SENSITIVE_UI_SMOKE_CLIENT', 'SENSITIVE_UI_SMOKE_CONTACT', 'В работе', 'Обычный',
    987654, 123456, 864198, 100000, 887654, 'Готово',
    'SENSITIVE_UI_SMOKE_ORDER_INTERNAL', jsonb_build_object('secret', 'SENSITIVE_UI_SMOKE_ORDER_DATA'),
    'Монтаж: Запланирован', 'Запланирован', 'Synthetic staging address',
    v_now + interval '1 day', 'Synthetic Installer', 'SYNTHETIC_CONTACT',
    v_now, v_now, v_now
  );

  insert into public.leader_production_jobs (
    id, owner_id, order_id, title, production_status, created_by, layout_status,
    priority, deadline, ready_at, contractor_cost, client_total, file_url,
    technical_task, contractor_comment, internal_comment, created_at, updated_at
  ) values (
    v_production_id, p_user_id, v_order_id, 'UI smoke production ' || v_run_key,
    'Готово', p_user_id, 'Макет согласован', 'Обычная', v_now + interval '12 hours',
    v_now, 123456, 987654, 'https://example.invalid/synthetic-layout.pdf',
    'Safe production task for staging UI smoke', 'Safe contractor note',
    'SENSITIVE_UI_SMOKE_PRODUCTION_INTERNAL', v_now, v_now
  );

  insert into public.leader_installation_jobs (
    id, owner_id, order_id, production_job_id, title, client_name, client_phone,
    install_status, priority, installer_name, installer_phone, address, scheduled_at,
    installer_cost, client_price, technical_task, tools_required, client_comment,
    installer_comment, internal_comment, result_comment, before_photo_url,
    after_photo_url, created_by, updated_by, created_at, updated_at
  ) values (
    v_job_id, p_user_id, v_order_id, v_production_id,
    'UI smoke installation ' || v_run_key,
    'SENSITIVE_UI_SMOKE_JOB_CLIENT', 'SENSITIVE_UI_SMOKE_JOB_CONTACT',
    'Запланирован', 'Обычный', 'Synthetic Installer', 'SYNTHETIC_CONTACT',
    'Synthetic staging address', v_now + interval '1 day',
    44444, 99999, 'Safe technical task for staging UI smoke',
    'Safe tools list', 'SENSITIVE_UI_SMOKE_CLIENT_COMMENT',
    'Safe installer comment', 'SENSITIVE_UI_SMOKE_JOB_INTERNAL', null,
    'https://example.invalid/synthetic-before.jpg', null,
    p_user_id, p_user_id, v_now, v_now
  );

  insert into public.leader_installation_job_items (
    job_id, order_id, name, unit, qty, width, height,
    installer_price, client_price, comment, created_at
  ) values (
    v_job_id, v_order_id, 'Synthetic sign installation', 'шт', 1, 2.5, 1.2,
    44444, 99999, 'Safe item comment', v_now
  );

  insert into public.leader_installation_events (
    job_id, order_id, event_type, old_status, new_status, body, created_by, created_at
  ) values (
    v_job_id, v_order_id, 'Создание', null, 'Запланирован',
    'Synthetic staging UI smoke fixture created', p_user_id, v_now
  );

  insert into public.leader_installation_comments (
    job_id, owner_id, comment_type, body, created_by, created_at
  ) values
    (v_job_id, p_user_id, 'public', 'Safe visible staging note', p_user_id, v_now),
    (v_job_id, p_user_id, 'internal', 'SENSITIVE_UI_SMOKE_INTERNAL_NOTE', p_user_id, v_now);

  insert into leader_staging.installation_ui_smoke_runs (
    run_key, auth_user_id, order_id, production_job_id, installation_job_id
  ) values (
    v_run_key, p_user_id, v_order_id, v_production_id, v_job_id
  );

  return jsonb_build_object(
    'ok', true,
    'run_key', v_run_key,
    'job_id', v_job_id,
    'role', 'installer',
    'expected_status', 'Запланирован'
  );
end
$function$;

revoke all on function public.leader_prepare_installation_ui_smoke_rpc(text,uuid,text) from public, anon, authenticated;
grant execute on function public.leader_prepare_installation_ui_smoke_rpc(text,uuid,text) to service_role;
