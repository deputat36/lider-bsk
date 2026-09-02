#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TRANSPORT = ROOT / 'crm/v4/assets/v4/design-task-staging-transport-v1.js'
PREVIEW = ROOT / 'crm/v4/assets/v4/design-task-draft-preview-v1.js'
PERMISSIONS = ROOT / 'crm/v4/assets/v4/action-permissions-v1.js'
CONFIG = ROOT / 'crm/v4/assets/v4/config.js'
SUPABASE_CONFIG = ROOT / 'supabase/config.toml'
CONTRACT = ROOT / 'contracts/design-task-staging-transport-v1.json'
TEST = ROOT / 'tools/test_design_task_staging_transport.mjs'
RUNBOOK = ROOT / 'docs/CRM_DESIGN_TASK_STAGING_TRANSPORT_RUNBOOK_2026-07-14.md'
WORKFLOW = ROOT / '.github/workflows/crm-design-task-draft-check.yml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'


def read(path: Path) -> str:
    if not path.exists():
        raise AssertionError(f'missing file: {path.relative_to(ROOT)}')
    return path.read_text(encoding='utf-8')


def require(source: str, markers: list[str], label: str) -> None:
    missing = [marker for marker in markers if marker not in source]
    if missing:
        raise AssertionError(f'{label}: missing markers: {missing}')


def forbid(source: str, markers: list[str], label: str) -> None:
    found = [marker for marker in markers if marker in source]
    if found:
        raise AssertionError(f'{label}: forbidden markers found: {found}')


def main() -> None:
    transport = read(TRANSPORT)
    preview = read(PREVIEW)
    permissions = read(PERMISSIONS)
    config = read(CONFIG)
    supabase_config = read(SUPABASE_CONFIG)
    contract = json.loads(read(CONTRACT))
    test = read(TEST)
    runbook = read(RUNBOOK)
    workflow = read(WORKFLOW)

    require(transport, [
        STAGING,
        "FUNCTION_SLUG = 'leader-crm-design'",
        "ACTION = 'design_task.create_from_order'",
        'designStagingTransportAvailability',
        'buildStagingDesignCommand',
        'invokeStagingDesignTask',
        'client.auth.getSession()',
        'client.functions.invoke(FUNCTION_SLUG, { body: command })',
        'readAfterSuccess',
        'stale_order',
        'active_task_conflict',
        'idempotency_conflict',
        'persistence_failed',
    ], 'staging transport')
    forbid(transport, [
        PRODUCTION,
        'SUPABASE_SERVICE_ROLE_KEY',
        'service_role',
        '.from(',
        '.insert(',
        '.update(',
        '.upsert(',
        '.delete(',
        '.rpc(',
        'leader_design_tasks',
        'leader_design_task_events',
        'leader_command_receipts',
    ], 'transport boundary')

    require(preview, [
        "import { V4_CONFIG } from './config.js'",
        "from './design-task-staging-transport-v1.js?v=20260827-revision-1'",
        'canPerformV4Action(CRM_V4_ACTIONS.DESIGN_WRITE)',
        "const ORDER_FIELDS = 'id,order_number,lead_id,project_name,status,priority,deadline,layout_status,layout_link,is_archived,updated_at'",
        'Создать тестовую задачу в staging',
        'Создать задачу в CRM — отключено',
        'data-design-task-staging-create',
        'readAfterSuccess: () => fetchTasks(',
    ], 'preview integration')
    forbid(preview, [
        'SUPABASE_SERVICE_ROLE_KEY',
        'service_role',
        '.insert(',
        '.update(',
        '.upsert(',
        '.delete(',
        '.rpc(',
    ], 'preview write boundary')

    require(permissions, [
        "DESIGN_WRITE: 'design.write'",
        'CRM_V4_ACTIONS.DESIGN_WRITE',
    ], 'canonical action registry')
    require(config, [
        f"supabaseUrl: 'https://{PRODUCTION}.supabase.co'",
        "authStorageKey: 'leader_crm_v4_main_session'",
    ], 'production CRM config')
    require(supabase_config, [
        f'project_id = "{PRODUCTION}"',
        '[functions.leader-crm-design]',
        'verify_jwt = true',
    ], 'Supabase config production binding')

    assert contract['environment']['allowed_project_ref'] == STAGING
    assert contract['environment']['production_project_ref'] == PRODUCTION
    assert contract['environment']['production_enabled'] is False
    assert contract['authorization']['browser_service_role_allowed'] is False
    assert contract['authorization']['canonical_registry'].endswith('action-permissions-v1.js')
    assert contract['results']['read_after_success_required'] is True

    require(test, [
        'production_locked',
        'forbidden field leaked',
        'idempotent_replay',
        'stale_order',
        'active_task_conflict',
        'readAfterSuccess',
        'environment-locked, minimized and replay-safe',
    ], 'transport behavior test')
    require(runbook, [
        STAGING,
        PRODUCTION,
        'UNAUTHORIZED_NO_AUTH_HEADER',
        'Authenticated positive E2E',
        'safe staging read-path',
        'не выполнен',
        'Production rollout',
    ], 'manual runbook')
    require(workflow, [
        'tools/check_design_task_staging_transport.py',
        'node tools/test_design_task_staging_transport.mjs',
        'node --check crm/v4/assets/v4/design-task-staging-transport-v1.js',
    ], 'workflow')

    secret_patterns = [
        r'sb_secret_[A-Za-z0-9_-]{10,}',
        r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    ]
    for label, source in [('transport', transport), ('preview', preview), ('runbook', runbook)]:
        for pattern in secret_patterns:
            if re.search(pattern, source):
                raise AssertionError(f'{label}: possible secret material')

    print('CRM design task staging transport is production-locked and uses the canonical JWT/action boundary.')


if __name__ == '__main__':
    main()
