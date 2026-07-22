-- STAGING ONLY acceptance for capability-aware installation frontend wiring.
-- Synthetic rows only; outer transaction always rolls back.

begin;

do $guard$
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
end
$guard$;

insert into public.leader_user_profiles(user_id,email,full_name,role,is_active)
values
  ('e1000000-0000-4000-8000-000000000001','ui-manager@example.test','UI Manager','manager',true),
  ('e1000000-0000-4000-8000-000000000002','ui-accountant@example.test','UI Accountant','accountant',true),
  ('e1000000-0000-4000-8000-000000000003','ui-installer@example.test','UI Installer','installer',true);

insert into public.leader_orders(
  id,owner_id,order_number,project_name,client_name,client_phone,status,
  client_total,contractor_cost,profit,internal_comment,data,
  installation_address,installation_status,updated_at
) values (
  'e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001',930001,
  'Safe UI order','SENSITIVE_UI_CLIENT','SENSITIVE_UI_PHONE','В работе',
  99999,77777,22222,'SENSITIVE_UI_INTERNAL',jsonb_build_object('secret','SENSITIVE_UI_DATA'),
  'Safe UI address','Запланирован','2026-07-22T19:50:00Z'
);

insert into public.leader_installation_jobs(
  id,owner_id,order_id,title,client_name,client_phone,install_status,address,
  installer_cost,client_price,internal_comment,updated_at
) values (
  'e4000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002','Safe UI installation','SENSITIVE_JOB_CLIENT',
  'SENSITIVE_JOB_PHONE','Запланирован','Safe UI address',44444,99999,
  'SENSITIVE_JOB_INTERNAL','2026-07-22T19:50:00Z'
);

do $acceptance$
declare
  v_manager jsonb;
  v_installer jsonb;
  v_accountant jsonb;
begin
  v_manager := public.leader_read_installation_job_rpc(
    'e1000000-0000-4000-8000-000000000001',
    'e4000000-0000-4000-8000-000000000004'
  );
  if coalesce((v_manager->>'ok')::boolean,false) is not true
     or coalesce((v_manager#>>'{capabilities,can_read}')::boolean,false) is not true
     or coalesce((v_manager#>>'{capabilities,can_write}')::boolean,false) is not true
     or v_manager#>>'{order,installation_status}' <> 'Запланирован' then
    raise exception 'manager_capability_projection_failed: %', v_manager;
  end if;

  v_installer := public.leader_read_installation_job_rpc(
    'e1000000-0000-4000-8000-000000000003',
    'e4000000-0000-4000-8000-000000000004'
  );
  if coalesce((v_installer#>>'{capabilities,can_write}')::boolean,false) is not true then
    raise exception 'installer_capability_projection_failed: %', v_installer;
  end if;

  v_accountant := public.leader_read_installation_job_rpc(
    'e1000000-0000-4000-8000-000000000002',
    'e4000000-0000-4000-8000-000000000004'
  );
  if v_accountant#>>'{error,code}' <> 'forbidden' then
    raise exception 'accountant_permission_failed: %', v_accountant;
  end if;

  if v_manager::text like '%SENSITIVE_%' then
    raise exception 'capability_projection_sensitive_marker_leaked: %', v_manager;
  end if;
  if (v_manager->'capabilities') ?| array['role','email','user_id','actions'] then
    raise exception 'capability_projection_identity_leaked: %', v_manager->'capabilities';
  end if;

  if has_function_privilege('authenticated','public.leader_read_installation_job_rpc(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.leader_read_installation_job_rpc(uuid,uuid)','EXECUTE') then
    raise exception 'installation_read_browser_execute_must_be_closed';
  end if;
  if not has_function_privilege('service_role','public.leader_read_installation_job_rpc(uuid,uuid)','EXECUTE') then
    raise exception 'installation_read_service_role_execute_missing';
  end if;
end
$acceptance$;

rollback;
