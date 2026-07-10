#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
helper = root / 'crm/v4/assets/v4/role-tab-permissions-v1.js'
board = root / 'crm/v4/assets/v4/production-board-v3.js'
production_card = root / 'crm/v4/assets/v4/production-job-card-v2.js'
installation_card = root / 'crm/v4/assets/v4/installation-job-card-v2.js'
tabs = root / 'crm/v4/assets/v4/crm-v4-tabs-lite.js'
manual = root / 'docs/CRM_V4_PRODUCTION_ROLE_DATA_MINIMIZATION_MANUAL_TEST_2026-07-10.md'

errors = []

checks = {
    helper: [
        'const COST_VISIBLE_ROLES',
        'const INTERNAL_NOTE_VISIBLE_ROLES',
        'const PRODUCTION_KIND_ROLES',
        "production: new Set(['owner', 'admin', 'manager', 'designer', 'contractor'])",
        "installation: new Set(['owner', 'admin', 'manager', 'installer'])",
        'export function canOpenV4ProductionKind',
        'export function firstAllowedV4ProductionKind',
        'export function canViewV4Costs',
        'export function canViewV4InternalNotes',
    ],
    board: [
        "canOpenV4ProductionKind('production')",
        "canOpenV4ProductionKind('installation')",
        'firstAllowedV4ProductionKind()',
        ': Promise.resolve([])',
        "select('id,order_id,title,production_status,deadline,layout_status,file_url')",
        "select('id,order_id,title,install_status,scheduled_at,address,installer_name')",
        'function permittedKind(requested)',
        'function kindTabs(activeKind)',
        'Показываются только разрешённые для текущей роли типы заданий',
    ],
    production_card: [
        'canOpenV4ProductionKind',
        "if (!canOpenV4ProductionKind('production')) throw new Error",
        "if (!jobId || busy || !canOpenV4ProductionKind('production')) return",
        "if (busy || !canOpenV4ProductionKind('production')) return",
        "if (!canOpenV4ProductionKind('production')) return",
        "if (canViewV4Costs()) fields.push('contractor_cost')",
        "if (canViewV4Costs()) fields.push('contractor_price')",
        "if (canViewV4InternalNotes()) fields.push('internal_comment')",
        "if (canViewV4InternalNotes()) fields.push('created_by_email')",
        "order && canOpenV4Tab('orders')",
    ],
    installation_card: [
        'canOpenV4ProductionKind',
        "if (!canOpenV4ProductionKind('installation')) throw new Error",
        "if (!jobId || busy || !canOpenV4ProductionKind('installation')) return",
        "if (busy || !canOpenV4ProductionKind('installation')) return",
        "if (!canOpenV4ProductionKind('installation')) return",
        "if (canViewV4Costs()) fields.push('installer_cost')",
        "if (canViewV4Costs()) fields.push('installer_price')",
        "if (canViewV4InternalNotes()) fields.push('internal_comment')",
        "commentsQuery.neq('comment_type', 'internal')",
        "order && canOpenV4Tab('orders')",
    ],
    tabs: [
        "event.target.closest?.('[data-open-order]')",
        "!canOpenV4Tab('orders')",
        "dispatchDenied('orders', 'restricted_action')",
    ],
    manual: [
        'designer / contractor',
        'installer',
        'Use browser Network tools',
        '`contractor_cost`',
        '`installer_cost`',
        '`internal_comment`',
        'staff email in production events',
        'capture-phase router denies',
        'do not alter Supabase data, RLS, grants, policies or Edge Functions',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing production RBAC file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing production RBAC marker in {path.relative_to(root)}: {marker}')

if board.exists():
    text = board.read_text(encoding='utf-8')
    forbidden = [
        "select('id,order_id,title,production_status,deadline,layout_status,file_url,contractor_cost')",
        'client_total,contractor_cost',
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Production board still overfetches financial field: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM v4 production and installation UI data minimization guards are valid; server enforcement remains separate.')
