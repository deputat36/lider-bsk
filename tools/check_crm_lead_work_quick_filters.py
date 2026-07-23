#!/usr/bin/env python3
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'model': ROOT / 'crm/v4/assets/v4/lead-work-quick-filters-v1.js',
    'ui': ROOT / 'crm/v4/assets/v4/lead-work-quick-filters-ui-v1.js',
    'css': ROOT / 'crm/v4/assets/v4/lead-work-quick-filters-v1.css',
    'loader': ROOT / 'crm/v4/assets/v4/lead-analytics-badges-v1.js',
    'test': ROOT / 'tools/test_lead_work_quick_filters.mjs',
    'contract': ROOT / 'contracts/crm-lead-work-quick-filters-v1.json',
    'doc': ROOT / 'docs/CRM_LEAD_WORK_QUICK_FILTERS_V1_2026-07-23.md',
    'workflow': ROOT / '.github/workflows/crm-lead-work-quick-filters-check.yml',
}

errors = []
texts = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, *markers):
    for marker in markers:
        if marker not in texts.get(name, ''):
            errors.append(f'{name}: missing marker {marker!r}')


require(
    'model',
    "key: 'Новая'",
    "key: 'overdue_contact'",
    "key: 'no_next_contact'",
    "key: 'needs_calculation'",
    "key: 'offer_waiting'",
    "status === 'Нужно пересчитать'",
    "CALCULATION_STAGE_STATUSES.has(status)",
    "OFFER_WAITING_LEAD_STATUSES.has(status)",
    "workflowIndex.sentOfferLeadIds.has(id)",
    "row?.is_current_revision === false",
    'leadWorkQuickFilterCounts',
    'leadWorkQuickFilterModels',
)
require(
    'ui',
    "const ADVANCED_FILTERS = new Set(['needs_calculation', 'offer_waiting'])",
    "CRM_V4_ACTIONS.CALCULATIONS_READ",
    "CRM_V4_ACTIONS.OFFERS_READ",
    ".from('leader_lead_calculations')",
    ".select('lead_id,status,is_current_revision')",
    ".from('leader_commercial_offers')",
    ".select('lead_id,status')",
    ".in('lead_id', ids)",
    "data-lead-work-filter-reset",
    "aria-pressed",
    "workflow_read_failed",
    "setBaseStatusFilter('active')",
    "new URL('./lead-work-quick-filters-v1.css?v=20260723-1', import.meta.url)",
)
require(
    'loader',
    "import './lead-work-quick-filters-ui-v1.js?v=20260723-1';",
)
require(
    'css',
    '.v4-lead-work-filters',
    '.v4-lead-work-filter-buttons',
    'button.is-active',
    '@media(max-width:620px)',
    '@media(max-width:390px)',
)
require(
    'test',
    "status: 'Нужно пересчитать'",
    "status: 'Отправлено'",
    "is_current_revision: false",
    "needs_calculation: 2",
    "offer_waiting: 3",
    'Lead work quick filter model tests passed.',
)
require(
    'doc',
    'Что требует внимания',
    '1 заявка, которой действительно нужен расчёт',
    '3 заявки на этапе ожидания ответа по КП',
    "leader_lead_calculations.select('lead_id,status,is_current_revision')",
    "leader_commercial_offers.select('lead_id,status')",
    'Production Supabase не изменялся',
)
require(
    'workflow',
    'CRM lead work quick filters check',
    'node tools/test_lead_work_quick_filters.mjs',
    'python3 tools/check_crm_lead_work_quick_filters.py',
)

for name in ('model', 'ui'):
    for forbidden in (
        '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
        'service_role', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS',
        'client_name', 'client_phone', 'installer_cost', 'client_price',
        'contractor_cost', 'profit', 'internal_comment', 'data,'
    ):
        if forbidden in texts.get(name, ''):
            errors.append(f'{name}: forbidden mutation/secret/sensitive marker {forbidden!r}')

try:
    contract = json.loads(texts.get('contract', '{}'))
except json.JSONDecodeError as exc:
    contract = {}
    errors.append(f'Invalid contract JSON: {exc}')

if contract.get('contract') != 'crm-lead-work-quick-filters':
    errors.append('contract name drifted')
if contract.get('version') != 1:
    errors.append('contract version must be 1')
if contract.get('status') != 'frontend_read_only_ready':
    errors.append('contract status drifted')

snapshot = contract.get('production_snapshot', {})
expected_snapshot = {
    'read_only': True,
    'total_leads': 13,
    'new': 3,
    'overdue_contact': 8,
    'no_next_contact_active': 2,
    'needs_calculation': 1,
    'offer_waiting': 3,
}
for key, value in expected_snapshot.items():
    if snapshot.get(key) != value:
        errors.append(f'production snapshot {key} drifted')

reads = contract.get('reads', {})
if reads.get('calculation_fields') != ['lead_id', 'status', 'is_current_revision']:
    errors.append('calculation read allowlist drifted')
if reads.get('offer_fields') != ['lead_id', 'status']:
    errors.append('offer read allowlist drifted')
if reads.get('lead_ids_limited_to_loaded_list') is not True:
    errors.append('workflow reads must be limited to loaded lead IDs')

failure = contract.get('failure_behavior', {})
for key in (
    'main_lead_list_remains_available',
    'lead_only_filters_remain_available',
    'workflow_dependent_filters_disabled',
    'advanced_filter_resets_to_active_on_read_failure',
):
    if failure.get(key) is not True:
        errors.append(f'failure behavior {key} must be true')

boundary = contract.get('production_boundary', {})
for key in (
    'production_ddl', 'production_dml', 'edge_deploy', 'auth_changed',
    'rls_or_grants_changed', 'storage_changed', 'nav_changed',
):
    if boundary.get(key) is not False:
        errors.append(f'production boundary {key} must be false')

if errors:
    print('CRM lead work quick filter checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM lead work quick filters are read-only, bounded and contract-consistent.')
