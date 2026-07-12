#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
index = root / 'crm/v4/index.html'
module = root / 'crm/v4/assets/v4/crm-training-scenario-v1.js'
styles = root / 'crm/v4/assets/v4/crm-training-scenario-v1.css'
test = root / 'tools/test_crm_training_scenario.mjs'
manual = root / 'docs/CRM_V4_LOCAL_TRAINING_SCENARIO_2026-07-12.md'
status = root / 'docs/STATUS.md'
workflow = root / '.github/workflows/crm-training-scenario-check.yml'

errors = []
checks = {
    index: [
        'data-open-training-scenario', 'Пройти учебный заказ',
        'crm-training-scenario-v1.css?v=20260712-1',
        'crm-training-scenario-v1.js?v=20260712-1',
    ],
    module: [
        "leader_crm_v4_training_scenario_v1",
        "from './status-transitions-v1.js'",
        'validateStatusTransition', 'createTrainingScenarioState',
        'normalizeTrainingScenarioState', 'trainingScenarioProgress',
        'applyTrainingScenarioAction', 'schedule_contact', 'confirm_need',
        'approve_offer', 'create_order', 'production_transition',
        'Не передано', 'В производстве', 'Готово', 'Выдано',
        'запрещён registry', 'Безопасный режим',
        'не отправляет запросы', 'Учебная кофейня «Север»',
        'leader-v4:training-scenario-completed', 'localOnly: true',
        'window.localStorage',
    ],
    styles: [
        '.v4-training-modal', '.v4-training-safe',
        '.v4-training-steps li.is-active', '.v4-training-steps li.is-done',
        '.v4-training-error', '@media(max-width:440px)',
    ],
    test: [
        "['lead', 'need', 'offer', 'order', 'production']",
        "status: 'Выдано'", 'запрещён registry',
        "{ completed: 5, total: 5, percent: 100 }",
        'CRM local training scenario behavior is valid.',
    ],
    manual: [
        'Полностью локальный режим', 'УЧЕБНЫЙ-001',
        'Не передано → В производстве → Готово → Выдано',
        'не появляется в `leader_*`', 'Production boundary',
        'nav_*', 'localStorage',
    ],
    status: [
        'локальный учебный заказ', 'не создаёт строки в Supabase',
        'запрещённый прямой переход',
    ],
    workflow: [
        'node tools/test_crm_training_scenario.mjs',
        'python3 tools/check_crm_training_scenario.py',
        'crm/v4/assets/v4/status-transitions-v1.js',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing training scenario file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing training scenario marker in {path.relative_to(root)}: {marker}')

if module.exists():
    text = module.read_text(encoding='utf-8')
    for forbidden in ['supabaseClient', ".from('leader_", '.insert(', '.update(', '.upsert(', '.rpc(', 'fetch(']:
        if forbidden in text:
            errors.append(f'Training scenario must remain browser-local and write-free: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM training scenario is browser-local, registry-backed and protected from production writes.')
