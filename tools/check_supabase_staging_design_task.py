#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / 'contracts' / 'supabase-environments-v1.json'
CONFIG = ROOT / 'supabase' / 'config.toml'
GUARD = ROOT / 'supabase' / 'staging-migrations' / '20260713_00_environment_guard.sql'
HARNESS = ROOT / 'supabase' / 'staging-migrations' / '20260713_01_design_task_harness.sql'
TEST = ROOT / 'supabase' / 'staging-tests' / '20260713_design_task_create_from_order.sql'
DOC = ROOT / 'docs' / 'SUPABASE_STAGING_DESIGN_TASK_RPC_2026-07-13.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-task-staging-check.yml'

PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'
ORG = 'tcbupmmcojrcxfqjuwsm'

errors = []


def read(path: Path, label: str) -> str:
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require(text: str, markers, label: str):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


env_text = read(ENV, 'environment contract')
config = read(CONFIG, 'Supabase config')
guard = read(GUARD, 'staging environment guard')
harness = read(HARNESS, 'staging design harness')
test = read(TEST, 'staging integration test')
doc = read(DOC, 'staging documentation')
workflow = read(WORKFLOW, 'staging workflow')

try:
    env = json.loads(env_text) if env_text else {}
except json.JSONDecodeError as exc:
    errors.append(f'Environment contract JSON is invalid: {exc}')
    env = {}

if env:
    if env.get('contract_version') != 'leader-supabase-environments-v1':
        errors.append('Environment contract version is invalid')
    if (env.get('organization') or {}).get('id') != ORG:
        errors.append('Environment contract organization ID drifted')
    environments = env.get('environments') or {}
    if (environments.get('production') or {}).get('project_id') != PRODUCTION:
        errors.append('Production project ID drifted')
    if (environments.get('staging') or {}).get('project_id') != STAGING:
        errors.append('Staging project ID drifted')
    if (environments.get('production') or {}).get('mutations_require_explicit_approval') is not True:
        errors.append('Production mutation approval guard is missing')
    if (environments.get('staging') or {}).get('production_data_allowed') is not False:
        errors.append('Staging must forbid production data')
    binding = env.get('repository_binding') or {}
    if binding.get('staging_migrations_path') != 'supabase/staging-migrations':
        errors.append('Staging migration path is not isolated')
    if binding.get('automatic_github_deploy_enabled') is not False:
        errors.append('Automatic staging deploy must remain disabled')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must continue to identify production')
if STAGING in config:
    errors.append('Staging project ID must not replace the standard config project')

for label, text in [('guard SQL', guard), ('harness SQL', harness), ('test SQL', test)]:
    if PRODUCTION in text:
        errors.append(f'{label}: production project ID is forbidden')
    if STAGING not in text:
        errors.append(f'{label}: exact staging project ID guard is required')
    lowered = text.lower()
    for forbidden in ('nav_', 'nav-', 'parket_', 'parket-', 'broker_', 'broker-'):
        if forbidden in lowered:
            errors.append(f'{label}: out-of-scope marker {forbidden!r}')

require(guard, [
    'create schema if not exists leader_staging',
    'leader_staging.environment_guard',
    "environment_name = 'staging'",
    'alter table leader_staging.environment_guard enable row level security',
    'revoke all on table leader_staging.environment_guard from anon',
    'grant select on table leader_staging.environment_guard to service_role',
], 'guard SQL')

require(harness, [
    'staging_environment_guard_failed',
    'create schema if not exists leader_private',
    'leader_private.leader_command_receipts',
    'leader_design_tasks_one_active_per_order_uidx',
    'public.leader_create_design_task_from_order_rpc(p_payload jsonb)',
    'security invoker',
    "set search_path = ''",
    'extensions.digest',
    'pg_try_advisory_xact_lock',
    'for update',
    'design_task.create_from_order',
    "task_status not in ('Завершено', 'Отменено')",
    'revoke all on function public.leader_create_design_task_from_order_rpc(jsonb) from authenticated',
    'grant execute on function public.leader_create_design_task_from_order_rpc(jsonb) to service_role',
], 'harness SQL')

if 'security definer' in harness.lower():
    errors.append('Harness RPC must not use SECURITY DEFINER')

required_test_cases = [
    "'success'", "'replay'", "'hash_conflict'", "'active_conflict'",
    "'denied_role'", "'inactive'", "'stale'", "'non_design'",
    "'foreign_need'", "'wrong_production'", "'after_completed'",
    "'unknown_status'", "'event_rollback'", "'receipt_rollback'",
    'has_function_privilege', 'PRIVATE_CLIENT_SENTINEL',
    'synthetic test cleanup failed', 'COMMIT;',
]
require(test, required_test_cases, 'test SQL')

if 'ON COMMIT DROP' in test:
    errors.append('Test result table must survive COMMIT for the final summary')
if 'DELETE FROM public.leader_' not in test or 'DROP FUNCTION leader_staging.build_design_test_payload' not in test:
    errors.append('Synthetic test cleanup is incomplete')

secret_patterns = [
    r'(?i)service[_-]?role\s*[=:]\s*["\']?[A-Za-z0-9._-]{20,}',
    r'(?i)database[_-]?password\s*[=:]',
    r'(?i)supabase[_-]?db[_-]?password\s*[=:]',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{10,}',
]
for path, text in [(ENV, env_text), (GUARD, guard), (HARNESS, harness), (TEST, test), (DOC, doc), (WORKFLOW, workflow)]:
    for pattern in secret_patterns:
        if re.search(pattern, text):
            errors.append(f'{path.relative_to(ROOT)} contains a possible secret')

require(doc, [PRODUCTION, STAGING, 'staging-only', 'production', 'синтетическ', 'не нормализована'], 'staging documentation')
require(workflow, ['check_supabase_staging_design_task.py', 'supabase/staging-migrations/**', 'supabase/staging-tests/**'], 'staging workflow')

if errors:
    print('Supabase staging design-task checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Supabase staging design-task environment, SQL and tests are isolated and guarded.')
