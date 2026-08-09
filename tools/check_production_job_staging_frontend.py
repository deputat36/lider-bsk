#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'model': ROOT / 'crm/v4/assets/v4/production-job-staging-draft-model-v1.js',
    'transport': ROOT / 'crm/v4/assets/v4/production-job-staging-transport-v1.js',
    'preview': ROOT / 'crm/v4/assets/v4/production-job-staging-preview-v1.js',
    'order_card': ROOT / 'crm/v4/assets/v4/order-card-v1.js',
    'design_entrypoints': ROOT / 'crm/v4/assets/v4/design-task-draft-entrypoints-v1.js',
    'loader': ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js',
    'permissions': ROOT / 'crm/v4/assets/v4/action-permissions-v1.js',
    'config': ROOT / 'crm/v4/assets/v4/config.js',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-production-create/contract.ts',
    'contract': ROOT / 'contracts/production-job-staging-transport-v1.json',
    'model_test': ROOT / 'tools/test_production_job_staging_draft.mjs',
    'transport_test': ROOT / 'tools/test_production_job_staging_transport.mjs',
    'runbook': ROOT / 'docs/CRM_PRODUCTION_JOB_STAGING_FRONTEND_RUNBOOK_2026-08-09.md',
    'workflow': ROOT / '.github/workflows/crm-production-job-staging-frontend-check.yml',
}

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
    source = {key: read(path) for key, path in FILES.items()}
    contract = json.loads(source['contract'])

    require(source['model'], [
        'buildProductionJobStagingDraft',
        'CRM_V4_ACTIONS.PRODUCTION_READ',
        'CRM_V4_ACTIONS.PRODUCTION_WRITE',
        "command: 'production_job.create_from_order'",
        "layout_status: 'Макет согласован'",
        'active_job_exists',
        'layout_not_approved',
    ], 'draft model')
    forbid(source['model'], [
        'client_name', 'client_phone', 'payment_status', 'client_total', 'balance', 'profit'
    ], 'draft privacy boundary')

    require(source['transport'], [
        STAGING,
        "FUNCTION_SLUG = 'leader-crm-production-create'",
        "ACTION = 'production_job.create_from_order'",
        "PERMISSION = 'production.write'",
        'productionStagingTransportAvailability',
        'buildStagingProductionCommand',
        'invokeStagingProductionJob',
        'client.auth.getSession()',
        'client.functions.invoke(FUNCTION_SLUG, { body: command })',
        'readAfterSuccess',
        'stale_order',
        'active_job_conflict',
        'layout_conflict',
        'idempotency_conflict',
        'safeServerProjection',
    ], 'staging transport')
    forbid(source['transport'], [
        PRODUCTION,
        'SUPABASE_SERVICE_ROLE_KEY',
        'service_role',
        '.from(', '.insert(', '.update(', '.upsert(', '.delete(', '.rpc(',
        'leader_production_jobs', 'leader_production_events', 'leader_command_receipts',
    ], 'transport boundary')

    require(source['preview'], [
        "import { V4_CONFIG } from './config.js'",
        "from './production-job-staging-transport-v1.js'",
        'isStagingProductionEnvironment(V4_CONFIG.supabaseUrl)',
        'requireV4Action(CRM_V4_ACTIONS.PRODUCTION_READ)',
        'requireV4Action(CRM_V4_ACTIONS.PRODUCTION_WRITE)',
        'Передать в производство (staging)',
        'Создать тестовое задание в staging',
        'readAfterSuccess: () => verifyByReplay(currentContext)',
        'verification.replay',
        "const ORDER_FIELDS = 'id,order_number,project_name,status,priority,deadline,layout_status,layout_link,is_archived,updated_at'",
    ], 'preview integration')
    forbid(source['preview'], [
        'SUPABASE_SERVICE_ROLE_KEY', 'service_role',
        '.insert(', '.update(', '.upsert(', '.delete(', '.rpc(',
        'leader_payments', 'leader_expenses', 'client_phone', 'client_total', 'profit',
    ], 'preview write/privacy boundary')

    require(source['order_card'], [
        "new CustomEvent('leader-v4:order-card-rendered'",
        "detail: { orderId: String(order.id || '') }",
    ], 'order card signal')
    require(source['design_entrypoints'], [
        "document.addEventListener('leader-v4:order-card-rendered'",
        'lastOpenedOrderId = orderId',
    ], 'design card entrypoint signal')

    orders_group = source['loader'].split('orders: Object.freeze({', 1)[1].split('order_control: Object.freeze({', 1)[0]
    require(orders_group, [
        "import('./design-task-draft-preview-v1.js?v=20260714-design-staging-1')",
        "import('./design-task-draft-entrypoints-v1.js?v=20260714-design-staging-1')",
        "import('./production-job-staging-preview-v1.js?v=20260809-production-staging-1')",
    ], 'orders lazy group')

    require(source['permissions'], [
        "PRODUCTION_READ: 'production.read'",
        "PRODUCTION_WRITE: 'production.write'",
    ], 'canonical action registry')
    require(source['config'], [
        f"supabaseUrl: 'https://{PRODUCTION}.supabase.co'",
        "authStorageKey: 'leader_crm_v4_main_session'",
    ], 'production CRM config')
    require(source['edge_contract'], [
        f"STAGING_PROJECT_REF = '{STAGING}'",
        "PRODUCTION_CREATE_ACTION = 'production_job.create_from_order'",
        "PRODUCTION_CREATE_PERMISSION = 'production.write'",
    ], 'deployed staging Edge contract')

    assert contract['environment']['allowed_project_ref'] == STAGING
    assert contract['environment']['production_project_ref'] == PRODUCTION
    assert contract['environment']['production_enabled'] is False
    assert contract['authorization']['browser_service_role_allowed'] is False
    assert contract['authorization']['required_read_action'] == 'production.read'
    assert contract['authorization']['required_write_action'] == 'production.write'
    assert contract['results']['read_after_success_mode'] == 'exact_idempotent_replay'
    assert contract['ui']['production_button_allowed'] is False
    assert contract['ui']['production_network_allowed'] is False

    require(source['model_test'], [
        'layout_not_approved', 'active_job_exists', 'forbidden order data leaked',
        'status-registry aware'
    ], 'model behavior test')
    require(source['transport_test'], [
        'production_locked', 'forbidden field leaked', 'idempotent_replay',
        'stale_order', 'active_job_conflict', 'idempotency_conflict',
        'environment-locked, minimized and replay-safe'
    ], 'transport behavior test')
    require(source['runbook'], [
        STAGING, PRODUCTION, 'exact idempotent replay', 'HTTP 201', 'HTTP 200',
        'Production rollout запрещён', 'authenticated positive browser E2E не выполнен'
    ], 'runbook')
    require(source['workflow'], [
        'tools/check_production_job_staging_frontend.py',
        'node tools/test_production_job_staging_draft.mjs',
        'node tools/test_production_job_staging_transport.mjs',
        'node --check crm/v4/assets/v4/production-job-staging-preview-v1.js',
    ], 'workflow')

    secret_patterns = [
        r'sb_secret_[A-Za-z0-9_-]{10,}',
        r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    ]
    for label in ['model', 'transport', 'preview', 'contract', 'runbook']:
        for pattern in secret_patterns:
            if re.search(pattern, source[label]):
                raise AssertionError(f'{label}: possible secret material')

    print('CRM production job staging frontend is production-locked, minimized and directly wired to orders.')


if __name__ == '__main__':
    main()
