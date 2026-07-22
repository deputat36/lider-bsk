-- STAGING ONLY acceptance for installation_job.read.
-- Synthetic sensitive markers only; outer transaction always rolls back.

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
  ('d1000000-0000-4000-8000-000000000001','read-manager@example.test','Read Manager','manager',true),
  ('d1000000-0000-4000-8000-000000000002','read-accountant@example.test','Read Accountant','accountant',true),
  ('d1000000-0000-4000-8000-000000000003','read-inactive@example.test','Read Inactive','manager',false);

insert into public.leader_orders(
  id,owner_id,order_number,project_name,client_name,client_phone,status,layout_link,
  client_total,contractor_cost,profit,internal_comment,data,
  installation_address,installation_scheduled_at,installer_name,installer_phone,current_stage,updated_at
) values (
  'd2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',920001,
  'Safe order','SENSITIVE_ORDER_CLIENT','SENSITIVE_ORDER_PHONE','В работе','https://example.test/layout',
  99999,77777,22222,'SENSITIVE_ORDER_INTERNAL',jsonb_build_object('secret','SENSITIVE_ORDER_DATA'),
  'Safe installation address','2026-07-26T09:00:00Z','Safe installer','+70000000000','Монтаж: Запланирован','2026-07-22T05:05:00Z'
);

insert into public.leader_production_jobs(
  id,owner_id,order_id,title,production_status,contractor_cost,client_total,file_url,
  technical_task,contractor_comment,internal_comment,updated_at
) values (
  'd3000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000002','Safe production','Готово',55555,88888,
  'https://example.test/file','Safe production task','SENSITIVE_CONTRACTOR_COMMENT',
  'SENSITIVE_PRODUCTION_INTERNAL','2026-07-22T05:05:00Z'
);

insert into public.leader_installation_jobs(
  id,owner_id,order_id,production_job_id,title,client_name,client_phone,install_status,priority,
  installer_name,installer_phone,address,scheduled_at,installer_cost,client_price,technical_task,
  tools_required,client_comment,installer_comment,internal_comment,result_comment,
  before_photo_url,after_photo_url,updated_at
) values (
  'd4000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000003',
  'Safe installation','SENSITIVE_JOB_CLIENT','SENSITIVE_JOB_PHONE','Запланирован','Высокий',
  'Safe installer','+70000000000','Safe address','2026-07-26T09:00:00Z',44444,99999,
  'Safe task','Safe tools','SENSITIVE_CLIENT_COMMENT','Safe installer comment',
  'SENSITIVE_JOB_INTERNAL','Safe result','https://example.test/before','https://example.test/after',
  '2026-07-22T05:05:00Z'
);

insert into public.leader_installation_job_items(
  id,job_id,order_id,name,unit,qty,width,height,installer_price,client_price,comment
) values (
  'd5000000-0000-4000-8000-000000000005','d4000000-0000-4000-8000-000000000004',
  'd2000000-0000-4000-8000-000000000002','Safe item','шт',2,100,200,12345,54321,'Safe item comment'
);

insert into public.leader_installation_events(id,job_id,order_id,event_type,old_status,new_status,body)
values ('d6000000-0000-4000-8000-000000000006','d4000000-0000-4000-8000-000000000004',
  'd2000000-0000-4000-8000-000000000002','status','Не назначен','Запланирован','Safe event');

insert into public.leader_installation_comments(id,job_id,comment_type,body)
values
  ('d7000000-0000-4000-8000-000000000007','d4000000-0000-4000-8000-000000000004','internal','SENSITIVE_INTERNAL_COMMENT'),
  ('d7000000-0000-4000-8000-000000000008','d4000000-0000-4000-8000-000000000004','installer','Safe visible comment');

do $acceptance$
declare
  v_result jsonb;
  v_forbidden jsonb;
  v_inactive jsonb;
  v_missing jsonb;
begin
  v_result := public.leader_read_installation_job_rpc(
    'd1000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000004'
  );
  if coalesce((v_result->>'ok')::boolean,false) is not true
     or v_result->>'action' <> 'installation_job.read' then
    raise exception 'installation_read_success_failed: %', v_result;
  end if;
  if v_result::text like '%SENSITIVE_%' then
    raise exception 'installation_read_sensitive_marker_leaked: %', v_result;
  end if;
  if (v_result->'entity') ?| array['client_name','client_phone','installer_cost','client_price','client_comment','internal_comment','owner_id','created_by','updated_by'] then
    raise exception 'installation_read_entity_forbidden_keys: %', v_result->'entity';
  end if;
  if (v_result->'order') ?| array['client_name','client_phone','client_total','contractor_cost','profit','internal_comment','data','owner_id','client_id'] then
    raise exception 'installation_read_order_forbidden_keys: %', v_result->'order';
  end if;
  if (v_result->'production') ?| array['contractor_cost','client_total','contractor_comment','internal_comment','contractor_id','owner_id','created_by'] then
    raise exception 'installation_read_production_forbidden_keys: %', v_result->'production';
  end if;
  if (v_result#>'{items,0}') ?| array['installer_price','client_price','order_id','job_id'] then
    raise exception 'installation_read_item_forbidden_keys: %', v_result#>'{items,0}';
  end if;
  if jsonb_array_length(v_result->'items') <> 1
     or jsonb_array_length(v_result->'events') <> 1
     or jsonb_array_length(v_result->'comments') <> 1
     or v_result#>>'{comments,0,body}' <> 'Safe visible comment' then
    raise exception 'installation_read_child_projection_failed: %', v_result;
  end if;

  v_forbidden := public.leader_read_installation_job_rpc(
    'd1000000-0000-4000-8000-000000000002',
    'd4000000-0000-4000-8000-000000000004'
  );
  if v_forbidden#>>'{error,code}' <> 'forbidden' then
    raise exception 'installation_read_forbidden_role_failed: %', v_forbidden;
  end if;

  v_inactive := public.leader_read_installation_job_rpc(
    'd1000000-0000-4000-8000-000000000003',
    'd4000000-0000-4000-8000-000000000004'
  );
  if v_inactive#>>'{error,code}' <> 'forbidden' then
    raise exception 'installation_read_inactive_profile_failed: %', v_inactive;
  end if;

  v_missing := public.leader_read_installation_job_rpc(
    'd1000000-0000-4000-8000-000000000001',
    'd4000000-0000-4000-8000-000000000099'
  );
  if v_missing#>>'{error,code}' <> 'not_found' then
    raise exception 'installation_read_not_found_failed: %', v_missing;
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
