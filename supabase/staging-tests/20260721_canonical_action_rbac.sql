-- STAGING ONLY.
-- Target project: lider-bsk-staging / otulfnouybahfnsycxqn.
-- The transaction is always rolled back; no synthetic profiles remain.

begin;

insert into public.leader_user_profiles (
  user_id,
  email,
  full_name,
  role,
  is_active,
  permissions,
  created_at,
  updated_at
)
values
  ('51000000-0000-4000-8000-000000000001', 'rbac-owner@example.invalid', 'RBAC Owner', 'owner', true, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000002', 'rbac-admin@example.invalid', 'RBAC Admin', 'admin', true, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000003', 'rbac-manager@example.invalid', 'RBAC Manager', 'manager', true, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000004', 'rbac-accountant@example.invalid', 'RBAC Accountant', 'accountant', true, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000005', 'rbac-designer@example.invalid', 'RBAC Designer', 'designer', true, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000006', 'rbac-installer@example.invalid', 'RBAC Installer', 'installer', true, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000007', 'rbac-contractor@example.invalid', 'RBAC Contractor', 'contractor', true, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000008', 'rbac-inactive@example.invalid', 'RBAC Inactive', 'owner', false, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000009', 'rbac-unknown@example.invalid', 'RBAC Unknown', 'unknown_role', true, '{}'::jsonb, now(), now())
on conflict (user_id) do update
set
  role = excluded.role,
  is_active = excluded.is_active,
  email = excluded.email,
  full_name = excluded.full_name,
  updated_at = now();

do $matrix_test$
declare
  v_result jsonb;
  v_denied jsonb;
  v_allowed jsonb;
begin
  if (select count(*) from leader_private.leader_role_action_matrix_v1) <> 7 then
    raise exception 'rbac_matrix_role_count_mismatch';
  end if;

  if (select cardinality(allowed_actions) from leader_private.leader_role_action_matrix_v1 where role = 'owner') <> 39 then
    raise exception 'rbac_owner_action_count_mismatch';
  end if;
  if (select cardinality(allowed_actions) from leader_private.leader_role_action_matrix_v1 where role = 'admin') <> 39 then
    raise exception 'rbac_admin_action_count_mismatch';
  end if;
  if (select cardinality(allowed_actions) from leader_private.leader_role_action_matrix_v1 where role = 'manager') <> 30 then
    raise exception 'rbac_manager_action_count_mismatch';
  end if;
  if (select cardinality(allowed_actions) from leader_private.leader_role_action_matrix_v1 where role = 'accountant') <> 8 then
    raise exception 'rbac_accountant_action_count_mismatch';
  end if;
  if (select cardinality(allowed_actions) from leader_private.leader_role_action_matrix_v1 where role = 'designer') <> 4 then
    raise exception 'rbac_designer_action_count_mismatch';
  end if;
  if (select cardinality(allowed_actions) from leader_private.leader_role_action_matrix_v1 where role = 'installer') <> 2 then
    raise exception 'rbac_installer_action_count_mismatch';
  end if;
  if (select cardinality(allowed_actions) from leader_private.leader_role_action_matrix_v1 where role = 'contractor') <> 2 then
    raise exception 'rbac_contractor_action_count_mismatch';
  end if;

  if not leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000001', 'settings.manage') then
    raise exception 'rbac_owner_positive_failed';
  end if;
  if not leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000002', 'users.manage') then
    raise exception 'rbac_admin_positive_failed';
  end if;
  if not leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000003', 'design.write') then
    raise exception 'rbac_manager_positive_failed';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000003', 'finance.read') then
    raise exception 'rbac_manager_finance_negative_failed';
  end if;
  if not leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000004', 'finance.write') then
    raise exception 'rbac_accountant_positive_failed';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000004', 'design.write') then
    raise exception 'rbac_accountant_design_negative_failed';
  end if;
  if not leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000005', 'design.write') then
    raise exception 'rbac_designer_positive_failed';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000005', 'orders.read') then
    raise exception 'rbac_designer_orders_negative_failed';
  end if;
  if not leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000006', 'installation.write') then
    raise exception 'rbac_installer_positive_failed';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000006', 'design.read') then
    raise exception 'rbac_installer_design_negative_failed';
  end if;
  if not leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000007', 'production.write') then
    raise exception 'rbac_contractor_positive_failed';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000007', 'design.read') then
    raise exception 'rbac_contractor_design_negative_failed';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000008', 'settings.manage') then
    raise exception 'rbac_inactive_profile_not_denied';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000009', 'leads.read') then
    raise exception 'rbac_unknown_role_not_denied';
  end if;
  if leader_private.leader_actor_has_crm_action('51000000-0000-4000-8000-000000000001', 'unknown.action') then
    raise exception 'rbac_unknown_action_not_denied';
  end if;
  if leader_private.leader_actor_has_crm_action(null, 'leads.read') then
    raise exception 'rbac_null_actor_not_denied';
  end if;

  perform set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000005', true);
  if not leader_private.leader_has_crm_action('design.read') then
    raise exception 'rbac_auth_uid_positive_failed';
  end if;
  if leader_private.leader_has_crm_action('finance.read') then
    raise exception 'rbac_auth_uid_negative_failed';
  end if;

  v_denied := public.leader_create_design_task_from_order_rpc(
    jsonb_build_object(
      'actor_id', '51000000-0000-4000-8000-000000000004',
      'request', jsonb_build_object(
        'action', 'design_task.create_from_order',
        'request_id', '52000000-0000-4000-8000-000000000001',
        'expected_updated_at', now(),
        'payload', jsonb_build_object()
      )
    )
  );

  if v_denied #>> '{error,code}' <> 'forbidden' then
    raise exception 'rbac_design_rpc_accountant_not_denied:%', v_denied;
  end if;

  v_allowed := public.leader_create_design_task_from_order_rpc(
    jsonb_build_object(
      'actor_id', '51000000-0000-4000-8000-000000000005',
      'request', jsonb_build_object(
        'action', 'design_task.create_from_order',
        'request_id', '52000000-0000-4000-8000-000000000002',
        'expected_updated_at', now(),
        'payload', jsonb_build_object()
      )
    )
  );

  if coalesce(v_allowed #>> '{error,code}', '') = 'forbidden' then
    raise exception 'rbac_design_rpc_designer_did_not_pass_gate:%', v_allowed;
  end if;

  v_result := jsonb_build_object(
    'matrix_roles', 7,
    'owner_actions', 39,
    'manager_actions', 30,
    'accountant_actions', 8,
    'unknown_role_denied', true,
    'unknown_action_denied', true,
    'inactive_denied', true,
    'accountant_rpc_denied_before_business_read', true,
    'designer_passed_authorization_boundary', true
  );

  raise notice 'canonical_action_rbac_test=%', v_result;
end
$matrix_test$;

rollback;
