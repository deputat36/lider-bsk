#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/lead-status-ui-model-v1.js'
adapter = root / 'crm/v4/assets/v4/lead-status-ui-registry-v1.js'
entry = root / 'crm/v4/assets/v4/lead-analytics-badges-v1.js'
card = root / 'crm/v4/assets/v4/lead-card.js'
html = root / 'crm/v4/index.html'
test = root / 'tools/test_crm_lead_status_ui.mjs'
manual = root / 'docs/CRM_LEAD_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md'

errors = []

checks = {
    model: [
        "from './status-transitions-v1.js'",
        'LEAD_QUICK_FILTERS',
        'rawLeadStatus',
        'leadStatusDefinitions',
        'unknownLeadStatuses',
        'leadStatusFilterOptions',
        'leadStatusUiModel',
        'canLeadStatusTransition',
        'leadPrimaryAction',
        'Принять заявку',
        'Зафиксировать потребность',
        'Сформировать КП',
        'Назначить следующий контакт',
        'Создать заказ',
        'Проверить связь заказа',
        'review_order_link',
        'связанная запись не найдена',
        "{ targetId: 'ordersBox' }",
        'Неизвестный статус:',
        'сохранён без изменения',
        "statusDefinition('lead', raw)",
        "allowedStatusTransitions('lead', current.key)",
        "canTransitionStatus('lead'",
    ],
    adapter: [
        "from './lead-status-ui-model-v1.js'",
        'syncStatusFilter',
        'data-unknown-status="true"',
        'syncLeadListCards',
        'data-lead-unknown-status',
        'syncLeadCardStatusActions',
        'data-status-key',
        'guardStatusClicks',
        "document.addEventListener('click', guardStatusClicks, true)",
        'event.stopImmediatePropagation()',
        'Переход «${from} → ${to}» не разрешён registry.',
        'Сначала переведите новую заявку в работу',
        'Статус завершён. Возврат не предусмотрен текущим registry.',
        "model.key === 'new'",
        "canLeadStatusTransition(model.raw, 'Ждём ответ')",
    ],
    entry: [
        "import './lead-status-ui-registry-v1.js';",
    ],
    card: [
        'leadPrimaryAction',
        'leadPrimaryActionHost',
        'data-lead-primary-action',
        'data-v2-calc-create-offer',
        'Другие действия и изменение этапа',
        'leadNextContactDetails',
        'data-action="open-create-need"',
        'Источник обращения и дополнительные сведения',
    ],
    html: [
        'lead-card.js?v=20260717-first-contact-1',
        'styles.css?v=20260717-primary-action-1',
    ],
    test: [
        "unknownLeadStatuses([{ status: unknown }, { status: unknown }])",
        'Неизвестный статус: ${unknown}',
        "leadStatusUiModel('Новая')",
        "['В работе', 'Уточнение деталей', 'Отказ', 'Спам']",
        "leadStatusUiModel('Создан заказ')",
        "canLeadStatusTransition('Новая', 'Создан заказ'), false",
        "canLeadStatusTransition(unknown, 'В работе'), false",
        "leadPrimaryAction({ status: 'Новая' }, { now })",
        "leadPrimaryAction({ status: 'В работе' }, { needCount: 1, now })",
        "leadPrimaryAction({ status: 'Ждём ответ' }, { now })",
        "leadPrimaryAction({ status: 'Создан заказ', converted_order_id: 'o1' }, { now })",
        "leadPrimaryAction({ status: 'Создан заказ', converted_order_id: null }, { now })",
        "missingOrderLinkAction.type, 'review_order_link'",
        "missingOrderLinkAction.targetId, 'ordersBox'",
        'CRM lead status UI registry behavior is valid.',
    ],
    manual: [
        'preserves unknown raw values',
        'Неизвестный статус: Legacy Custom Status',
        'the option value remains exactly `Legacy Custom Status`',
        'only registry-allowed targets are displayed',
        'Capture-phase guards',
        'hidden legacy `Новая → Ждём ответ` is blocked',
        'Проверка связи удалённого заказа',
        'Проверить связь заказа',
        'no new Supabase write path exists in the adapter',
        'raw production status rows are unchanged',
        '`nav_*`, `nav-*`, `parket-*` and `broker-*` are untouched',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing lead status UI registry file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing lead status UI marker in {path.relative_to(root)}: {marker}')

for path in (model, adapter):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    forbidden = [
        'supabaseClient',
        ".from('leader_",
        '.insert(',
        '.update(',
        '.delete(',
        '.upsert(',
        '.rpc(',
        'fetch(',
        'leader-public-lead',
        'leader-crm-leads',
        'leader-crm-orders',
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Lead status UI registry adapter must remain side-effect free: {path.relative_to(root)} contains {marker}')

if adapter.exists():
    text = adapter.read_text(encoding='utf-8')
    if 'data-lead-status="Создан заказ"' in text:
        errors.append('Adapter must not hardcode a direct Создан заказ transition button')

if card.exists():
    text = card.read_text(encoding='utf-8')
    for marker in ['Технические данные формы', 'class="v4-primary">Обновить']:
        if marker in text:
            errors.append(f'Lead card must keep technical or secondary actions out of the primary path: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead status UI uses the canonical registry, preserves unknown raw values and adds no Supabase write path.')
