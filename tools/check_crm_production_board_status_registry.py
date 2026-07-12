#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/production-board-status-model-v1.js'
alerts = root / 'crm/v4/assets/v4/production-alerts-v1.js'
test = root / 'tools/test_crm_production_board_status_model.mjs'
manual = root / 'docs/CRM_PRODUCTION_BOARD_STATUS_REGISTRY_MANUAL_TEST_2026-07-12.md'

errors = []

checks = {
    model: [
        "from './production-status-ui-model-v1.js'",
        "from './installation-status-ui-model-v1.js'",
        "const PRODUCTION_DONE_KEYS = new Set(['ready', 'issued', 'not_required', 'cancelled'])",
        'productionBoardStatus',
        'installationBoardStatus',
        'boardStatus',
        'isBoardDateOverdue',
        'isBoardDateToday',
        'productionBoardMetrics',
        'unknownProduction',
        'unknownInstallation',
    ],
    alerts: [
        "from './production-board-status-model-v1.js'",
        'productionBoardMetrics',
        'syncBoardSummary',
        'syncVisibleCards',
        'data-registry-unknown-status',
        "setSummaryValue('Производство открыто', counts.productionOpen)",
        "setSummaryValue('Монтаж открыт', counts.installationOpen)",
        "setSummaryValue('Просрочено', counts.overdueProduction + counts.overdueInstallation)",
        "select('id,production_status,deadline')",
        "select('id,install_status,scheduled_at')",
        'Неизвестных статусов',
        'Они не считаются завершёнными и остаются в открытом контроле.',
    ],
    test: [
        "productionBoardStatus('Готово')",
        "productionBoardStatus('В производстве')",
        "productionBoardStatus('Legacy Production State')",
        "installationBoardStatus(null)",
        "installationBoardStatus('Выполнен')",
        "installationBoardStatus('Проблема')",
        "boardStatus('installation', 'Legacy Installation State')",
        'metrics.productionOpen, 2',
        'metrics.installationOpen, 2',
        'metrics.unknownProduction, 1',
        'metrics.unknownInstallation, 1',
        'CRM production board status registry behavior is valid.',
    ],
    manual: [
        'leader-v4:production-board-rendered',
        '`Производство открыто`, `Монтаж открыт` and `Просрочено`',
        'A production status `Готово` is treated as completed for production workload',
        'Legacy Production State',
        'id,production_status,deadline',
        'id,install_status,scheduled_at',
        'must not issue INSERT, UPDATE, DELETE, UPSERT, RPC or Edge Function requests',
        'Manual verification remains required before closing #217.',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing production board registry file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing production board registry marker in {path.relative_to(root)}: {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for marker in ['supabaseClient', ".from('leader_", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(']:
        if marker in text:
            errors.append(f'Production board status model must remain side-effect free: {marker}')

if alerts.exists():
    text = alerts.read_text(encoding='utf-8')
    forbidden_heuristics = [
        'const DONE_PRODUCTION',
        'const DONE_INSTALLATION',
        'function isDone(',
        "text.includes('готов')",
        "text.includes('выполн')",
    ]
    for marker in forbidden_heuristics:
        if marker in text:
            errors.append(f'Legacy production-board heuristic remains in alert correction: {marker}')

    for marker in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'functions.invoke', 'fetch(']:
        if marker in text:
            errors.append(f'Production board registry correction must remain read-only: {marker}')

    forbidden_fields = [
        'client_name', 'client_phone', 'phone,email', 'message', 'internal_comment',
        'contractor_cost', 'installer_cost', 'contractor_price', 'installer_price', 'profit'
    ]
    for marker in forbidden_fields:
        if marker in text:
            errors.append(f'Production board registry correction must not request sensitive field: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM production board summaries and alerts use registry-backed read-only status metrics.')
