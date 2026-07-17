#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/need-readiness-model-v1.js'
panel = root / 'crm/v4/assets/v4/need-readiness-panel-v1.js'
loader = root / 'crm/v4/assets/v4/site-cache-note-v1.js'
needs = root / 'crm/v4/assets/v4/needs.js'
calculations = root / 'crm/v4/assets/v4/calculations.js'
offers = root / 'crm/v4/assets/v4/offers.js'
test = root / 'tools/test_need_readiness.mjs'
manual = root / 'docs/CRM_NEED_READINESS_WARNING_MANUAL_TEST_2026-07-13.md'
status = root / 'docs/STATUS.md'
workflow = root / '.github/workflows/crm-need-readiness-check.yml'

errors = []
checks = {
    model: [
        'NEED_READINESS_THRESHOLD = 80',
        'normalizeMissingFields',
        'activeLeadNeeds',
        'evaluateNeedReadiness',
        'calculationReadinessContext',
        'offerReadinessContext',
        "state: 'unlinked_calculation'",
        "state: 'calculation_without_need'",
        "state: 'linked_need_unavailable'",
        "level: 'critical'",
        "level: 'warning'",
        "level: 'neutral'",
        "status).toLocaleLowerCase('ru-RU') !== 'архив'",
    ],
    panel: [
        "from './state.js'",
        "from './need-readiness-model-v1.js'",
        'needReadinessCalculationV1',
        'needReadinessOfferV1',
        '#calcNeedId, #offerCalculationId',
        'data-need-readiness-action',
        'Предупреждение advisory',
        'сохранение расчёта и формирование КП автоматически не блокируются',
        'MutationObserver',
        'LeaderV4NeedReadinessV1Booted',
        'requestAnimationFrame',
        'scrollIntoView',
        "[data-action=\"open-create-need\"]",
        "document.getElementById('needFormBox')",
    ],
    loader: [
        "import('./need-readiness-panel-v1.js?v=20260713-readiness-1')",
    ],
    needs: [
        'completeness_score,missing_fields',
        'payload.completeness_score = completeness.score',
        'payload.missing_fields = completeness.missing',
    ],
    calculations: [
        'id="calcNeedId"',
        'id="saveCalculationBtn"',
        'need_id: val(\'calcNeedId\') || null',
    ],
    offers: [
        'id="offerCalculationId"',
        'id="createOfferBtn"',
        'const CALC_FIELDS =',
        'need_id',
    ],
    test: [
        'NEED_READINESS_THRESHOLD',
        "state, 'below_threshold'",
        "state, 'missing_fields'",
        "state, 'ready'",
        "state, 'unlinked_calculation'",
        "state, 'calculation_without_need'",
        'Need readiness warning model behavior is valid.',
    ],
    manual: [
        'source-only и advisory',
        'completeness_score >= 80',
        'missing_fields',
        '14 потребностей',
        'ниже 80% — 9',
        'Browser Network checklist',
        'выбор и переходы readiness не создают Fetch/XHR',
        'Production boundary',
        'Approval gates',
        'nav_*',
    ],
    status: [
        'Предупреждение готовности потребности',
        'need-readiness-panel-v1.js',
        'completeness_score',
        'missing_fields',
        'advisory',
    ],
    workflow: [
        'node tools/test_need_readiness.mjs',
        'python3 tools/check_need_readiness_warning.py',
        'node --check crm/v4/assets/v4/need-readiness-model-v1.js',
        'node --check crm/v4/assets/v4/need-readiness-panel-v1.js',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing readiness file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing readiness marker in {path.relative_to(root)}: {marker}')

for path in (model, panel):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for forbidden in (
        'supabaseClient',
        '.from(',
        'fetch(',
        '.insert(',
        '.update(',
        '.delete(',
        '.upsert(',
        '.rpc(',
    ):
        if forbidden in text:
            errors.append(f'Readiness module must remain state-only and write-free in {path.relative_to(root)}: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM need readiness warnings are advisory, state-only, linked to calculation/offer context and protected from production writes.')
