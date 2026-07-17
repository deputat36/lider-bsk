#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/lead-attribution-funnel-model-v1.js'
panel = root / 'crm/v4/assets/v4/lead-attribution-funnel-panel-v1.js'
normalization = root / 'crm/v4/assets/v4/lead-analytics-normalization.js'
leads = root / 'crm/v4/assets/v4/leads.js'
loader = root / 'crm/v4/assets/v4/site-cache-note-v1.js'
test = root / 'tools/test_lead_attribution_funnel.mjs'
manual = root / 'docs/CRM_LEAD_ATTRIBUTION_FUNNEL_MANUAL_TEST_2026-07-17.md'
status = root / 'docs/STATUS.md'
workflow = root / '.github/workflows/crm-lead-attribution-funnel-check.yml'

checks = {
    model: ['buildLeadAttributionFunnel', 'deriveLeadAnalytics', 'normalizeLeadLandingPage', 'orderConversionPercent', 'plannedRevenue', 'bySource', 'byPage'],
    panel: [
        "from './api.js'", 'friendlyError(error)',
        "readRows('leader_lead_calculations', CALCULATION_FIELDS)",
        "readRows('leader_commercial_offers', OFFER_FIELDS)",
        "readRows('leader_orders', ORDER_FIELDS)",
        'Что приносит заказы', 'Заявка → расчёт → КП → заказ',
        'По нормализованным источникам', 'По страницам и точкам входа',
        'request_id', 'data-lead-attribution-filter', 'data-lead-attribution-refresh',
    ],
    normalization: ['normalizeLeadLandingPage', 'utmSource', 'Telegram', 'QR-код', 'Поиск', 'Email'],
    leads: ['source_page_path,request_id,utm_source,utm_medium,utm_campaign'],
    loader: ["import('./lead-attribution-funnel-panel-v1.js?v=20260717-attribution-1')"],
    test: ['UTM priority', 'plannedRevenue, 60000', 'Lead attribution funnel behavior is valid'],
    manual: ['13 обращений', '5 связаны с заказом', 'Read-only', 'Network', 'Production boundary'],
    status: ['Воронка заказов по источникам и страницам'],
    workflow: ['python3 tools/check_lead_attribution_funnel.py', 'node tools/test_lead_attribution_funnel.mjs'],
}

errors = []
for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing lead attribution file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing lead attribution marker in {path.relative_to(root)}: {marker}')

for path in [model, panel, normalization]:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for forbidden in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(']:
        if forbidden in text:
            errors.append(f'Lead attribution source must remain read-only: {path.relative_to(root)} contains {forbidden}')

if panel.exists():
    text = panel.read_text(encoding='utf-8')
    for forbidden_field in ['client_name', 'client_phone', 'phone,', 'message,', 'internal_comment', 'contractor_cost', 'profit,']:
        if forbidden_field in text:
            errors.append(f'Attribution panel must not request personal, comment or margin fields: {forbidden_field}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead attribution funnel is read-only, data-minimized and protected by source/runtime contracts.')
