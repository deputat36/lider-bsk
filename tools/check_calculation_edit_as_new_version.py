#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'bootstrap': ROOT / 'crm/v4/assets/v4/calculation-version-integrity-model-v1.js',
    'model': ROOT / 'crm/v4/assets/v4/calculation-version-edit-model-v1.js',
    'editor': ROOT / 'crm/v4/assets/v4/calculation-version-editor-v1.js',
    'css': ROOT / 'crm/v4/assets/v4/calculation-version-editor-v1.css',
    'test': ROOT / 'tools/test_calculation_version_edit_model.mjs',
    'doc': ROOT / 'docs/CRM_CALCULATION_EDIT_AS_NEW_VERSION_2026-07-16.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-edit-version-check.yml',
}

errors = []
texts = {}
for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name, markers):
    text = texts.get(name, '')
    for marker in markers:
        if marker not in text:
            errors.append(f'{name}: missing marker {marker!r}')


require('bootstrap', [
    "import('./calculation-version-editor-v1.js')",
    'document.readyState',
    'bootCalculationVersionEditor',
])

require('model', [
    'nextCalculationVersion',
    'Math.max(0, ...versions)',
    'calculationVersionDraftTitle',
    'copyCalculationItemsForVersion',
    'calculationVersionTotals',
    'createCalculationVersionDraft',
    'Исходный расчёт сохранён без изменений',
])

for forbidden in [
    'version_number: calculations.length + 1',
    'commercial_offer_id: source.commercial_offer_id',
    'order_id: source.order_id',
    '.update(',
]:
    if forbidden in texts.get('model', ''):
        errors.append(f'model contains forbidden source mutation/version marker: {forbidden}')

require('editor', [
    "import { loadCalculations, renderCalculations } from './calculations.js'",
    'savedCalculationsWorkspace',
    'savedCalculationsSnapshot',
    'MutationObserver',
    'snapshot.replaceChildren(savedSection)',
    'renderCalculations()',
    'Изменить / новая версия',
    'Новый пустой расчёт',
    'source.lead_id !== v4State.route.leadId',
    'fetchCalculationItems',
    'createCalculationVersionDraft',
    'freshNextVersion',
    ".select('id,version_number')",
    'nextCalculationVersion(response.data || [])',
    ".from('leader_lead_calculations')",
    '.insert(calcPayload)',
    ".from('leader_lead_calculation_items')",
    '.insert(itemPayloads)',
    'commercial_offer_id: null',
    'order_id: null',
    'rollbackCalculation',
    'Старый расчёт не изменён',
    'calculation-version-editor-v1.css?v=20260716-1',
])

for forbidden in [
    "from('leader_lead_calculations').update",
    "from('leader_lead_calculation_items').update",
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    'otulfnouybahfnsycxqn',
    'nav_',
    'parket_',
    'broker_',
]:
    if forbidden in texts.get('editor', ''):
        errors.append(f'editor contains forbidden mutation/environment marker: {forbidden}')

require('css', [
    '.v4-calculation-version-workspace',
    '.v4-calculation-builder-host .v4-calculations-section>.v4-calculations-list',
    '.v4-version-editor',
    '.v4-version-edit-grid',
    '.v4-version-totals',
    '@media(max-width:720px)',
])

require('test', [
    'nextCalculationVersion',
    'version_number: 3',
    "'Баннер — правки v4'",
    'copyCalculationItemsForVersion',
    "'id' in copied[0], false",
    'calculationVersionTotals',
    'createCalculationVersionDraft',
    'Calculation version edit model tests passed.',
])

require('doc', [
    'два модуля использовали один DOM-контейнер `calculationsBox`',
    '`Новый пустой расчёт`',
    '`Изменить / новая версия`',
    '`max(version_number) + 1`',
    'старая версия не обновляется и не удаляется',
    'не наследует `commercial_offer_id` и `order_id`',
    'MutationObserver',
    'production и staging DDL не выполняются',
])

require('workflow', [
    'node --check crm/v4/assets/v4/calculation-version-edit-model-v1.js',
    'node --check crm/v4/assets/v4/calculation-version-editor-v1.js',
    'node tools/test_calculation_version_edit_model.mjs',
    'python3 tools/check_calculation_edit_as_new_version.py',
])

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Existing calculations can be copied into editable new versions in the same lead without mutating the source.')
