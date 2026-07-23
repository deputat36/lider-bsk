-- SOURCE-ONLY PRODUCTION CANDIDATE.
-- Target project: lider-bsk production / ofewxuqfjhamgerwzull.
-- DO NOT APPLY without an explicit production database approval.
-- This candidate installs only the canonical RBAC core and durable command receipts.
-- It does not install installation read/update RPC, Edge Functions or frontend routing.

begin;

do $preflight$
declare
  v_unknown_roles text[];
begin
  if to_regclass('leader_staging.environment_guard') is not null then
    raise exception 'production_candidate_rejected_on_staging';
  end if;

  if to_regclass('public.leader_user_profiles') is null then
    raise exception 'leader_user_profiles_missing';
  end if;

  if to_regclass('leader_private.leader_role_action_matrix_v1') is not null
     or to_regclass('leader_private.leader_command_receipts') is not null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is not null
     or to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') is not null then
    raise exception 'production_rbac_or_receipts_already_present';
  end if;

  select array_agg(distinct lower(btrim(coalesce(role, ''))) order by lower(btrim(coalesce(role, ''))))
  into v_unknown_roles
  from public.leader_user_profiles
  where lower(btrim(coalesce(role, ''))) not in (
    'owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor'
  );

  if coalesce(cardinality(v_unknown_roles), 0) > 0 then
    raise exception 'unknown_production_roles: %', array_to_string(v_unknown_roles, ', ');
  end if;
end
$preflight$;

create table leader_private.leader_role_action_matrix_v1 (
  role text primary key,
  allowed_actions text[] not null,
  contract_version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint leader_role_action_matrix_v1_role_check
    check (role in ('owner', 'admin', 'manager', 'accountant', 'designer', 'installer', 'contractor')),
  constraint leader_role_action_matrix_v1_version_check
    check (contract_version = 1),
  constraint leader_role_action_matrix_v1_actions_check
    check (cardinality(allowed_actions) > 0)
);

alter table leader_private.leader_role_action_matrix_v1 enable row level security;
revoke all on table leader_private.leader_role_action_matrix_v1 from public, anon, authenticated;
grant select, insert, update, delete on table leader_private.leader_role_action_matrix_v1 to service_role;

-- MATRIX_JSON_BEGIN
-- Must remain identical to contracts/crm-v4-role-action-matrix-v1.json.
do $seed$
declare
  v_matrix jsonb := $matrix$
{
  "owner": ["leads.read","leads.create","leads.update","leads.assign","leads.transition","clients.read","clients.write","needs.read","needs.write","calculations.read","calculations.write","costs.read","offers.read","offers.write","offers.transition","orders.read","orders.create","orders.update","orders.transition","production.read","production.write","installation.read","installation.write","design.read","design.write","finance.read","finance.write","documents.read","documents.create","documents.update","documents.generate","documents.send","documents.sign","documents.void","catalog.read","catalog.manage","audit.read","users.manage","settings.manage"],
  "admin": ["leads.read","leads.create","leads.update","leads.assign","leads.transition","clients.read","clients.write","needs.read","needs.write","calculations.read","calculations.write","costs.read","offers.read","offers.write","offers.transition","orders.read","orders.create","orders.update","orders.transition","production.read","production.write","installation.read","installation.write","design.read","design.write","finance.read","finance.write","documents.read","documents.create","documents.update","documents.generate","documents.send","documents.sign","documents.void","catalog.read","catalog.manage","audit.read","users.manage","settings.manage"],
  "manager": ["leads.read","leads.create","leads.update","leads.assign","leads.transition","clients.read","clients.write","needs.read","needs.write","calculations.read","calculations.write","offers.read","offers.write","offers.transition","orders.read","orders.create","orders.update","orders.transition","production.read","production.write","installation.read","installation.write","design.read","design.write","documents.read","documents.create","documents.update","documents.generate","documents.send","audit.read"],
  "accountant": ["orders.read","finance.read","finance.write","costs.read","documents.read","documents.generate","documents.send","documents.sign"],
  "designer": ["design.read","design.write","production.read","production.write"],
  "installer": ["installation.read","installation.write"],
  "contractor": ["production.read","production.write"]
}
$matrix$::jsonb;
begin
  insert into leader_private.leader_role_action_matrix_v1 (
    role,
    allowed_actions,
    contract_version,
    updated_at
  )
  select
    entry.key,
    array(select jsonb_array_elements_text(entry.value)),
    1,
    now()
  from jsonb_each(v_matrix) as entry;
end
$seed$;
-- MATRIX_JSON_END

comment on table leader_private.leader_role_action_matrix_v1 is
  'Canonical CRM v4 role/action matrix. Browser roles have no table privileges.';

create or replace function leader_private.leader_actor_has_crm_action(
  p_actor_id uuid,
  p_action text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_actor_id is not null
    and nullif(btrim(coalesce(p_action, '')), '') is not null
    and exists (
      select 1
      from public.leader_user_profiles as profile
      join leader_private.leader_role_action_matrix_v1 as matrix
        on matrix.role = lower(btrim(coalesce(profile.role, '')))
      where profile.user_id = p_actor_id
        and profile.is_active = true
        and btrim(p_action) = any (matrix.allowed_actions)
    );
$function$;

comment on function leader_private.leader_actor_has_crm_action(uuid, text) is
  'Actor-aware canonical CRM action authorization. Unknown role/action and inactive profiles fail closed.';

revoke all on function leader_private.leader_actor_has_crm_action(uuid, text)
  from public, anon, authenticated;
grant execute on function leader_private.leader_actor_has_crm_action(uuid, text)
  to service_role;

create or replace function public.leader_actor_has_crm_action_rpc(
  p_actor_id uuid,
  p_action text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select leader_private.leader_actor_has_crm_action(p_actor_id, p_action);
$function$;

comment on function public.leader_actor_has_crm_action_rpc(uuid, text) is
  'Service-role bridge to the private canonical CRM action matrix. Never accepts a browser-supplied role.';

revoke all on function public.leader_actor_has_crm_action_rpc(uuid, text)
  from public, anon, authenticated;
grant execute on function public.leader_actor_has_crm_action_rpc(uuid, text)
  to service_role;

create table leader_private.leader_command_receipts (
  id uuid primary key default gen_random_uuid(),
  action text not null check (char_length(action) between 1 and 120),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 180),
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid not null,
  state text not null default 'in_progress'
    check (state in ('in_progress', 'success')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint leader_command_receipts_action_key_uidx
    unique (action, idempotency_key),
  constraint leader_command_receipts_action_request_uidx
    unique (action, request_id),
  constraint leader_command_receipts_state_payload_check
    check (
      (state = 'in_progress' and response is null and completed_at is null)
      or
      (state = 'success' and jsonb_typeof(response) = 'object' and completed_at is not null)
    )
);

alter table leader_private.leader_command_receipts enable row level security;
revoke all on table leader_private.leader_command_receipts from public, anon, authenticated;
grant select, insert, update on table leader_private.leader_command_receipts to service_role;

comment on table leader_private.leader_command_receipts is
  'Durable service-role-only idempotency receipts for atomic CRM commands.';

commit;
