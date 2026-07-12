#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = root / 'crm/v4/assets/v4/crm-training-scenario-model-v1.js'
ui = root / 'crm/v4/assets/v4/crm-training-scenario-v1.js'
loader = root / 'crm/v4/assets/v4/site-cache-note-v1.js'
styles = root / 'crm/v4/assets/v4/crm-quick-start-v1.css'
test = root / 'tools/test_crm_training_scenario.mjs'
manual = root / 'docs/CRM_LOCAL_TRAINING_SCENARIO_2026-07-12.md'
workflow = root / '.github/workflows/crm-quick-start-check.yml'

errors = []
checks = {
    model: [
        'CRM_TRAINING_SCENARIO_VERSION = 1',
        "['lead', 'need', 'offer', 'order', 'finish']",
        "id: 'banner-coffee-shop-v1'",
        'Учебный заказ: баннер для кофейни',
        'Полнота потребности: 85%',
        'Отмена не считается выполнением',
        'normalizeTrainingScenarioState',
        'startTrainingScenario',
        'completeTrainingStep',
        'trainingScenarioProgress',
        'currentTrainingStep',
        'resetTrainingScenario',
    ],
    ui: [
        "leader_crm_v4_training_scenario_v1",
        "from './crm-training-scenario-model-v1.js'",
        'Прогресс реального quick-start не изменяется',
        'Начать тренировку',
        'Выполнить учебный шаг',
        'Сбросить тренировку',
        'Клиенты, заявки, КП, заказы, задачи и платежи в Supabase не создаются',
        'window.localStorage',
        'window.localStorage.removeItem',
        'data-training-complete',
        'data-training-reset',
    ],
    loader: [
        "import('./crm-training-scenario-v1.js?v=20260712-training-1')",
        "CRM_ACCESS_ROUTE_VERSION = '20260712-training-1'",
    ],
    styles: [
        '.v4-training-scenario',
        '.v4-training-step.is-current',
        '.v4-training-step.is-done',
        '.v4-training-step.is-locked',
        '.v4-training-finished',
        '.v4-training-local-note',
    ],
    test: [
        'CRM_TRAINING_SCENARIO_VERSION, 1',
        "['lead', 'need', 'offer', 'order', 'finish']",
        "completeTrainingStep(started, 'need')",
        '{ completed: 5, total: 5, percent: 100, finished: true }',
        'CRM local training scenario behavior is valid.',
    ],
    manual: [
        'Локальный учебный сценарий',
        'leader_crm_v4_training_scenario_v1',
        'не изменяет основной quick-start',
        'Network',
        'никаких INSERT, UPDATE, DELETE, UPSERT, RPC или Edge Function',
        'Production boundary',
        'Ctrl + F5',
    ],
    workflow: [
        'python3 tools/check_crm_training_scenario.py',
        'node tools/test_crm_training_scenario.mjs',
        'crm-training-scenario-model-v1.js',
        'crm-training-scenario-v1.js',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing CRM training scenario file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing CRM training scenario marker in {path.relative_to(root)}: {marker}')

for path in (model, ui):
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for forbidden in [
        'supabaseClient', ".from('leader_", '.insert(', '.update(', '.delete(',
        '.upsert(', '.rpc(', 'functions.invoke', 'fetch('
    ]:
        if forbidden in text:
            errors.append(f'CRM training scenario must remain local and write-free: {path.relative_to(root)} contains {forbidden}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for forbidden in ['window.', 'document.', 'localStorage']:
        if forbidden in text:
            errors.append(f'CRM training model must remain pure: {forbidden}')

if ui.exists():
    text = ui.read_text(encoding='utf-8')
    if 'leader_crm_v4_quick_start_v1' in text:
        errors.append('Training scenario must not write the real quick-start storage key')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM local training scenario is sequential, browser-local, separate from real quick-start and production-write-free.')
