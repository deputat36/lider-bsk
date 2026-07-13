#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/order-contract-model-v1.js'
preview = root / 'crm/v4/assets/v4/order-contract-preview-v1.js'
act = root / 'crm/v4/assets/v4/order-act-preview-v1.js'
settings_preview = root / 'crm/v4/assets/v4/company-legal-settings-preview-v1.js'
behavior = root / 'tools/test_crm_order_contract.mjs'
manual = root / 'docs/CRM_ORDER_CONTRACT_GENERATOR_2026-07-13.md'
workflow = root / '.github/workflows/crm-order-contract-check.yml'

errors = []
checks = {
    model: [
        'ORDER_CONTRACT_MODEL_VERSION = 1',
        'ORDER_CONTRACT_PAYMENT_MODES',
        'ORDER_CONTRACT_TEMPLATES',
        'general_services',
        'advertising_installation',
        'repair_maintenance',
        'normalizeOrderContractDraft',
        'orderContractPaymentText',
        'orderContractSections',
        'orderContractWarnings',
        'налог на профессиональный доход',
        'несохранённый черновик',
    ],
    preview: [
        "from './order-contract-model-v1.js'",
        "from './company-legal-settings-v1.js'",
        'CRM_V4_ACTIONS.DOCUMENTS_GENERATE',
        "from('leader_orders').select(ORDER_FIELDS)",
        "from('leader_order_items').select(ITEM_FIELDS)",
        "from('leader_clients').select(CLIENT_FIELDS)",
        'loadCompanyLegalSettings',
        'data-order-contract-preview',
        'Создать договор',
        'orderContractWarnings',
        'Предварительный несохранённый черновик',
        'Приложение № 1. Спецификация',
        'Печать / PDF',
    ],
    act: [
        "import './order-contract-preview-v1.js';",
    ],
    settings_preview: [
        'contractDraftExecutor',
        'contractDraftExecutorDetails',
        'contractDraftExecutorRepresentative',
        'contractDraftExecutorRole',
        'contractDraftTaxMode',
        'orderContractDraftForm',
    ],
    behavior: [
        'suggestedOrderContractTemplate',
        'orderContractSections',
        'orderContractWarnings',
        'CRM order contract draft model is valid and browser-local.',
    ],
    manual: [
        'source-only',
        'Без записи в Supabase',
        'DOCUMENTS_GENERATE',
        '100% предоплата',
        '50% аванс / 50% после акта',
        'Приложение № 1',
        'паспортные данные',
        'ручную юридическую проверку',
    ],
    workflow: [
        'node tools/test_crm_order_contract.mjs',
        'python3 tools/check_crm_order_contract.py',
        'node --check crm/v4/assets/v4/order-contract-model-v1.js',
        'node --check crm/v4/assets/v4/order-contract-preview-v1.js',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing CRM order contract file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing CRM order contract marker in {path.relative_to(root)}: {marker}')

for path in [model, preview]:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for marker in ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', '.functions.invoke(', '.storage.']:
        if marker in text:
            errors.append(f'CRM order contract source contains a write marker in {path.relative_to(root)}: {marker}')

if preview.exists():
    text = preview.read_text(encoding='utf-8')
    for marker in ['contractor_cost', 'contractor_price', 'profit', 'internal_comment', 'payment_amount', 'expense']:
        if marker in text:
            errors.append(f'CRM order contract preview exposes internal field marker: {marker}')

combined = '\n'.join(
    path.read_text(encoding='utf-8')
    for path in [model, preview]
    if path.exists()
)
for marker in [
    'Ковтун Алексей Вадимович',
    '360405284607',
    '40817810800002082094',
    '2010 354303',
    'код подразделения',
    'паспорт выдан',
]:
    if marker.lower() in combined.lower():
        errors.append(f'Personal requisites must not be hardcoded in public CRM source: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM order contract generator is read-only, permission-guarded and free of hardcoded personal requisites.')
