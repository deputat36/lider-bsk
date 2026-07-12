#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
index = root / 'crm/v4/index.html'
module = root / 'crm/v4/assets/v4/crm-quick-start-v1.js'
styles = root / 'crm/v4/assets/v4/crm-quick-start-v1.css'
test = root / 'tools/test_crm_quick_start.mjs'
manual = root / 'docs/CRM_V4_QUICK_START_2026-07-12.md'
status = root / 'docs/STATUS.md'
workflow = root / '.github/workflows/crm-quick-start-check.yml'

errors = []
checks = {
    index: [
        'id="crmQuickStart"', 'Первые 15 минут', 'Первый рабочий маршрут',
        'data-quick-start-step="lead"', 'data-quick-start-step="need"',
        'data-quick-start-step="offer"', 'data-quick-start-step="order"',
        'data-quick-start-step="finish"', 'data-quick-start-tab="order_control"',
        'для обучения не создавайте вымышленных клиентов',
        'crm-quick-start-v1.css?v=20260712-1',
        'crm-quick-start-v1.js?v=20260712-1',
        'Рабочая схема',
    ],
    module: [
        "leader_crm_v4_quick_start_v1", 'QUICK_START_STEP_IDS',
        'normalizeQuickStartState', 'setQuickStartStep', 'quickStartProgress',
        'window.localStorage', 'data-quick-start-tab', 'tabAvailable',
        "typeof window.v4SetTab !== 'function'", "leader-v4:tab-denied",
        'quick_start_role_not_allowed', 'leader-v4:crm-ready',
    ],
    styles: [
        '.v4-quick-start', '.v4-quick-start-step.is-done',
        '.v4-quick-start-actions', '@media(max-width:700px)',
    ],
    test: [
        "['lead', 'need', 'offer', 'order', 'finish']",
        "{ completed: 1, total: 5, percent: 20 }",
        "{ completed: 5, total: 5, percent: 100 }",
        'CRM quick-start state and progress behavior is valid.',
    ],
    manual: [
        'Первые 15 минут', 'не создаёт демо-записи',
        'Заявка → потребность → расчёт/КП → заказ → производство/монтаж',
        'localStorage', 'Проверка прав роли', 'Production boundary',
        'leader_*', 'nav_*',
    ],
    status: [
        '## Быстрый старт CRM', 'технические заглушки',
        'прогресс и свёрнутое состояние хранятся только в браузере',
    ],
    workflow: [
        'python3 tools/check_crm_quick_start.py',
        'node tools/test_crm_quick_start.mjs',
        'node --check crm/v4/assets/v4/crm-quick-start-v1.js',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing quick-start file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing quick-start marker in {path.relative_to(root)}: {marker}')

if index.exists():
    text = index.read_text(encoding='utf-8')
    for obsolete in ['<h2>CRM готова</h2>', '<h2>Автопилот проверки</h2>', 'Следующий контрольный шаг — ручная браузерная проверка']:
        if obsolete in text:
            errors.append(f'Obsolete technical placeholder remains in CRM UI: {obsolete}')

if module.exists():
    text = module.read_text(encoding='utf-8')
    for forbidden in ['supabaseClient', ".from('leader_", '.insert(', '.update(', '.upsert(', '.rpc(', 'fetch(']:
        if forbidden in text:
            errors.append(f'Quick-start module must remain browser-local and write-free: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM v4 quick-start replaces technical placeholders, respects visible role tabs and remains browser-local.')
