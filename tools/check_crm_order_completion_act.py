#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
module = root / 'crm/v4/assets/v4/order-act-preview-v1.js'
actions = root / 'crm/v4/assets/v4/action-permissions-v1.js'
index = root / 'crm/v4/index.html'
architecture = root / 'docs/CRM_ORDER_COMPLETION_ACT_ARCHITECTURE_2026-07-10.md'
manual = root / 'docs/CRM_ORDER_COMPLETION_ACT_MANUAL_TEST_2026-07-10.md'

errors = []

checks = {
    module: [
        "import { CRM_V4_ACTIONS, canPerformV4Action, requireV4Action } from './action-permissions-v1.js';",
        "CRM_V4_ACTIONS.DOCUMENTS_GENERATE",
        "supabaseClient.from('leader_orders').select(ORDER_FIELDS)",
        "supabaseClient.from('leader_order_items').select(ITEM_FIELDS)",
        "supabaseClient.from('leader_clients').select(CLIENT_FIELDS)",
        "const ITEM_FIELDS = 'id,order_id,name,unit,quantity,client_sum,created_at'",
        "АВР-${new Date().getFullYear()}-ЧЕРНОВИК-",
        'Черновик акта выполненных работ',
        'Предварительный несохранённый черновик',
        'Номер не является окончательным и не проверяется на уникальность',
        'Предпросмотр / печать PDF',
        "const popup = window.open('', '_blank');",
        'popup.opener = null',
        'thead{display:table-header-group}',
        '@page{size:A4',
        'Печать/PDF не меняет заказ, оплату, производство или монтаж',
        'new MutationObserver(injectOrderCardButton)',
    ],
    actions: [
        "DOCUMENTS_READ: 'documents.read'",
        "DOCUMENTS_CREATE: 'documents.create'",
        "DOCUMENTS_UPDATE: 'documents.update'",
        "DOCUMENTS_GENERATE: 'documents.generate'",
        "DOCUMENTS_SEND: 'documents.send'",
        "DOCUMENTS_SIGN: 'documents.sign'",
        "DOCUMENTS_VOID: 'documents.void'",
        'CRM_V4_ACTIONS.DOCUMENTS_GENERATE',
        'CRM_V4_ACTIONS.DOCUMENTS_SIGN',
    ],
    index: [
        'assets/v4/order-card-v1.js',
        'assets/v4/order-act-preview-v1.js?v=20260710-1',
    ],
    architecture: [
        'leader_order_documents',
        'leader_order_document_items',
        'document.create_act',
        'leader_create_order_act_rpc',
        'АВР-YYYY-NNNN',
        'immutable versioned JSON snapshot',
        'documents.generate',
        'No production persistence work is authorized by this document',
    ],
    manual: [
        'https://deputat36.github.io/lider-bsk/crm/v4/?tab=orders',
        'no INSERT, UPDATE or DELETE request',
        '`contractor_cost`',
        '`contractor_price`',
        '`profit`',
        'designer / installer / contractor',
        'Предпросмотр / печать PDF',
        'Предварительный несохранённый черновик',
        'popup blocking is handled with a clear error',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing completion-act file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing completion-act marker in {path.relative_to(root)}: {marker}')

if module.exists():
    text = module.read_text(encoding='utf-8')
    forbidden = [
        '.insert(',
        '.update(',
        '.delete(',
        'contractor_cost',
        'contractor_price',
        'contractor_sum',
        'profit',
        'margin',
        'internal_comment',
        "const popup = window.open('', '_blank', 'noopener,noreferrer')",
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Completion-act preview contains forbidden write/sensitive/broken marker: {marker}')

if actions.exists():
    text = actions.read_text(encoding='utf-8')
    for role in ['designer', 'installer', 'contractor']:
        start = text.find(f'{role}: Object.freeze([')
        end = text.find(']),', start)
        block = text[start:end] if start >= 0 and end >= 0 else ''
        if 'DOCUMENTS_' in block:
            errors.append(f'Restricted role unexpectedly has document action: {role}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM order completion act preview is read-only, client-facing, permission-guarded and documented.')
