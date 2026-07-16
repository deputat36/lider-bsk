#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'bootstrap': ROOT / 'crm/v4/assets/v4/calculation-version-integrity-model-v1.js',
    'actions': ROOT / 'crm/v4/assets/v4/action-permissions-v1.js',
    'model': ROOT / 'crm/v4/assets/v4/calculation-version-edit-model-v1.js',
    'route': ROOT / 'crm/v4/assets/v4/calculation-version-save-route-v1.js',
    'editor': ROOT / 'crm/v4/assets/v4/calculation-version-editor-v1.js',
    'css': ROOT / 'crm/v4/assets/v4/calculation-version-editor-v1.css',
    'test': ROOT / 'tools/test_calculation_version_edit_model.mjs',
    'route_test': ROOT / 'tools/test_calculation_version_save_route.mjs',
    'inventory_checker': ROOT / 'tools/check_crm_v4_backend_write_inventory.py',
    'inventory_addendum': ROOT / 'docs/CRM_V4_BACKEND_WRITE_INVENTORY_ADDENDUM_2026-07-10.md',
    'doc': ROOT / 'docs/CRM_CALCULATION_EDIT_AS_NEW_VERSION_2026-07-16.md',
    'title_doc': ROOT / 'docs/CRM_CALCULATION_VERSION_TITLE_INTENT_2026-07-16.md',
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
    "from './action-permissions-v1.js'",
    'CRM_V4_ACTIONS.CALCULATIONS_WRITE',
    'canPerformV4Action',
    "document.addEventListener('leader-v4:crm-ready'",
    "import('./calculation-version-editor-v1.js?v=20260716-title-rebase-1')",
    'bootCalculationVersionEditor',
])

require('actions', [
    "CALCULATIONS_WRITE: 'calculations.write'",
    'CRM_V4_ACTIONS.CALCULATIONS_WRITE',
    'export function canPerformV4Action',
])

require('model', [
    'nextCalculationVersion',
    'Math.max(0, ...versions)',
    'calculationVersionLegacyPreflight',
    "code: 'source_missing'",
    "code: 'source_changed'",
    "code: 'duplicate_version_inventory'",
    'actualTimestamp !== expectedTimestamp',
    'calculationVersionDraftTitle',
    'rebaseCalculationVersionDraftTitle',
    'calculationVersionTransportTitle',
    'Object.defineProperties(draft',
    'titleCustomized',
    'return customized ? customTitle : draft.autoTitle',
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

require('route', [
    'const currentTitle = text(source.title)',
    'const autoTitle = text(source.autoTitle)',
    'currentTitle && currentTitle !== autoTitle ? currentTitle : null',
    'title: transportTitle',
])

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
    'calculationVersionLegacyPreflight',
    'freshLegacyVersionPreflight',
    ".select('id,version_number,updated_at')",
    'sourceCalculationId: source.id',
    'expectedUpdatedAt: source.updated_at',
    'versionDraft.sourceCalculationId',
    'versionDraft.sourceUpdatedAt',
    "versionDraft.nextVersion = nextVersion",
    ".from('leader_lead_calculations')",
    '.insert(calcPayload)',
    ".from('leader_lead_calculation_items')",
    '.insert(itemPayloads)',
    'commercial_offer_id: null',
    'order_id: null',
    'rollbackLegacyCalculation',
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
    'calculationVersionLegacyPreflight',
    'rebaseCalculationVersionDraftTitle',
    'calculationVersionTransportTitle',
    "code, 'ready'",
    "code, 'duplicate_version_inventory'",
    "code, 'source_changed'",
    "code, 'source_missing'",
    'draft.nextVersion = 4',
    'draft.titleCustomized',
    'Индивидуальное название',
    'copyCalculationItemsForVersion',
    "'id' in copied[0], false",
    'calculationVersionTotals',
    'createCalculationVersionDraft',
    'Calculation version edit model tests passed.',
])

require('route_test', [
    'automatic title must be server-derived in staging',
    'Согласованный вариант для клиента',
    'assert.equal(draft.title, null)',
    'Calculation version save route tests passed.',
])

require('inventory_checker', [
    "'calculation-version-editor-v1.js'",
    "'calculations.js'",
    'Unclassified direct-write CRM files',
])

require('inventory_addendum', [
    '### `crm/v4/assets/v4/calculation-version-editor-v1.js`',
    'canonical permission: `calculations.write`',
    'future server action: `calculation.create_version`',
    'source calculation and its items remain unchanged',
    'temporary direct-write path',
])

require('doc', [
    'два модуля использовали один DOM-контейнер `calculationsBox`',
    '`Новый пустой расчёт`',
    '`Изменить / новая версия`',
    '`max(version_number) + 1`',
    'Fresh preflight production legacy',
    '`id, version_number, updated_at`',
    'исходный расчёт изменился после открытия',
    'повторяющиеся номера версий',
    'При ошибке preflight INSERT расчёта и позиций не выполняется',
    'старая версия не обновляется и не удаляется',
    'не наследует `commercial_offer_id` и `order_id`',
    'MutationObserver',
    'production и staging DDL не выполняются',
])

require('title_doc', [
    'автоматический заголовок',
    'пользовательский заголовок',
    'Баннер — правки v4',
    'Пользовательское название не перезаписывается',
    'Browser не отправляет автоматический заголовок',
    '"title": null',
    'Supabase не меняются',
])

require('workflow', [
    'node --check crm/v4/assets/v4/calculation-version-edit-model-v1.js',
    'node --check crm/v4/assets/v4/calculation-version-save-route-v1.js',
    'node --check crm/v4/assets/v4/calculation-version-editor-v1.js',
    'node tools/test_calculation_version_edit_model.mjs',
    'node tools/test_calculation_version_save_route.mjs',
    'python3 tools/check_calculation_edit_as_new_version.py',
    'python3 tools/check_crm_v4_backend_write_inventory.py',
])

if errors:
    print('\n'.join(errors), file=sys.stderr)
    raise SystemExit(1)

print('Calculation versions keep automatic titles aligned with actual version numbers and preserve custom titles.')
