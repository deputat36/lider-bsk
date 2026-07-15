#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'model': ROOT / 'crm/v4/assets/v4/crm-empty-state-model-v1.js',
    'enhancer': ROOT / 'crm/v4/assets/v4/crm-empty-state-enhancer-v1.js',
    'css': ROOT / 'crm/v4/assets/v4/crm-empty-state-v1.css',
    'tabs': ROOT / 'crm/v4/assets/v4/crm-v4-tabs-lite.js',
    'leads': ROOT / 'crm/v4/assets/v4/leads.js',
    'orders': ROOT / 'crm/v4/assets/v4/orders.js',
    'finance': ROOT / 'crm/v4/assets/v4/finance-control-v2.js',
    'audit': ROOT / 'crm/v4/assets/v4/public-lead-audit-v1.js',
    'test': ROOT / 'tools/test_crm_empty_state_model.mjs',
    'doc': ROOT / 'docs/CRM_UI_EMPTY_STATES_2026-07-15.md',
    'workflow': ROOT / '.github/workflows/crm-empty-states-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker {marker!r}')


require('model', [
    "CRM_EMPTY_STATE_CONTEXTS = Object.freeze(['leads', 'orders', 'finance', 'audit'])",
    "containerId === 'leadsList'",
    "containerId === 'ordersBox'",
    "containerId === 'financeControlContent'",
    "containerId === 'publicLeadAuditContent'",
    'crmEmptyStateKind',
    'crmEmptyStateModel',
    "attribute: 'data-retry-leads'",
    "attribute: 'data-reset-lead-filters'",
    "attribute: 'data-finance-control-refresh'",
    "attribute: 'data-public-lead-audit-refresh'",
    "attribute: 'data-public-lead-audit-clear-empty'",
    "tone = kind === 'error'",
    "financeColumn ? 'positive'",
])

require('enhancer', [
    "import { crmEmptyStateContext, crmEmptyStateModel } from './crm-empty-state-model-v1.js'",
    "const ROOT_SELECTORS = ['#leadsList', '#ordersBox', '#financeControlContent', '#publicLeadAuditContent']",
    'MutationObserver',
    "node.dataset.v4EmptyStateEnhanced = '1'",
    "state.setAttribute('role', model.kind === 'error' ? 'alert' : 'status')",
    "state.setAttribute('aria-live', model.kind === 'error' ? 'assertive' : 'polite')",
    'button.remove()',
    'actions.appendChild(button)',
    'textContent = model.detail',
    'data-public-lead-audit-clear-empty',
    "input.dispatchEvent(new Event('input', { bubbles: true }))",
    "document.querySelector('[data-public-lead-audit-filter=\"all\"]')",
])

forbidden_runtime = [
    "from './supabase-client.js'",
    '.from(',
    '.select(',
    '.insert(',
    '.update(',
    '.upsert(',
    '.delete(',
    '.rpc(',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    'leader_',
    'nav_',
    'parket_',
    'broker_',
]
forbid('model', forbidden_runtime)
forbid('enhancer', forbidden_runtime)

require('css', [
    '.v4-empty-state{',
    '.v4-empty-state.is-loading',
    '.v4-empty-state.is-error',
    '.v4-empty-state.is-positive',
    '.v4-empty-state.is-compact',
    '.v4-empty-state-actions',
    '@media(max-width:560px)',
    '@media(prefers-reduced-motion:reduce)',
    '@keyframes v4-empty-state-spin',
])

require('tabs', [
    "import './crm-empty-state-enhancer-v1.js';",
    "import { applyV4TabButtonVisibility",
])
if texts['tabs'].count("import './crm-empty-state-enhancer-v1.js';") != 1:
    errors.append('tabs: enhancer side-effect import must appear exactly once')

require('leads', [
    'class="v4-empty"',
    'data-retry-leads',
    'data-reset-lead-filters',
])
require('orders', [
    'id="ordersBox"',
    'class="v4-empty"',
    'Связанный заказ пока не создан',
])
require('finance', [
    'id="financeControlContent"',
    'class="v4-empty"',
    'data-finance-control-refresh',
    'Нет заказов в этой группе',
])
require('audit', [
    'id="publicLeadAuditContent"',
    'class="v4-empty"',
    'data-public-lead-audit-refresh',
    'Событий в этой группе пока нет',
])

require('test', [
    "CRM_EMPTY_STATE_CONTEXTS, ['leads', 'orders', 'finance', 'audit']",
    "'loading'",
    "'error'",
    "'initial'",
    "'filtered'",
    "'empty'",
    "financePositive.tone, 'positive'",
    "data-public-lead-audit-clear-empty",
    'without touching business data',
])

require('doc', [
    '# Единые пустые состояния CRM',
    '#leadsList',
    '#ordersBox',
    '#financeControlContent',
    '#publicLeadAuditContent',
    'не импортирует Supabase client',
    'не выполняет SELECT, INSERT, UPDATE, DELETE, UPSERT или RPC',
    'MutationObserver',
    'data-v4-empty-state-enhanced="1"',
    'role="status"',
    'role="alert"',
    'prefers-reduced-motion: reduce',
    'Supabase production и staging не меняются',
])

require('workflow', [
    'node --check crm/v4/assets/v4/crm-empty-state-model-v1.js',
    'node --check crm/v4/assets/v4/crm-empty-state-enhancer-v1.js',
    'node --check crm/v4/assets/v4/crm-v4-tabs-lite.js',
    'node tools/test_crm_empty_state_model.mjs',
    'python3 tools/check_crm_empty_states.py',
])

secret_patterns = (
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
)
for name, source in texts.items():
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{name}: possible secret material')

if errors:
    print('CRM empty-state checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM empty states are contextual, accessible, read-only and limited to four known containers.')
