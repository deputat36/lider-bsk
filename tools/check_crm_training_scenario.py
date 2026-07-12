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
loader = root / 'crm/v4/assets/v4/site-cache-note-v1.js'

errors = []
checks = {
    index: [
        'data-open-training-scenario', 'Пройти учебный заказ',
        'crm-training-scenario-v1.css?v=20260712-1',
    ],
    loader: [
        "CRM_ACCESS_ROUTE_VERSION = '20260712-training-3'",
        "import('./crm-training-scenario-v1.js?v=20260712-training-3')",
    ],
    module: [
        'leader_crm_v4_training_scenario_v1',
        "from './status-transitions-v1.js'",
        "from './role-tab-permissions-v1.js'",
        'roleAccessSummary', 'TRAINING_TRACK_IDS', 'TRAINING_TRACK_STEP_IDS',
        'availableTrainingTracks', 'trainingTrackForAccess',
        "['manager', 'production', 'installation']",
        'createTrainingScenarioState', 'normalizeTrainingScenarioState',
        'trainingScenarioProgress', 'applyTrainingScenarioAction',
        'schedule_contact', 'confirm_need', 'approve_offer', 'create_order',
        'confirm_production_brief', 'confirm_installation_brief',
        'production_transition', 'installation_transition',
        'Не передано', 'В производстве', 'Готово', 'Выдано',
        'Не назначен', 'Запланирован', 'В работе', 'Выполнен',
        'запрещён registry', 'Безопасный режим', 'не отправляет запросы',
        'Учебная кофейня «Север»', 'data-training-track',
        'data-training-open-tab', 'training_role_not_allowed',
        'leader-v4:training-scenario-completed', 'localOnly: true',
        'window.localStorage', 'LeaderV4TrainingScenarioV1Booted',
    ],
    styles: [
        '.v4-training-modal', '.v4-training-safe',
        '.v4-training-steps li.is-active', '.v4-training-steps li.is-done',
        '.v4-training-error', '@media(max-width:440px)',
    ],
    test: [
        "['lead', 'need', 'offer', 'order', 'production']",
        "['manager', 'production', 'installation']",
        "role: 'installer'", "role: 'contractor'",
        "status: 'Выдано'", "status: 'Выполнен'",
        'запрещён registry',
        '{ completed: 5, total: 5, percent: 100 }',
        '{ completed: 3, total: 3, percent: 100 }',
        'CRM role-aware local training scenario behavior is valid.',
    ],
    manual: [
        'Полностью локальный режим', 'УЧЕБНЫЙ-001',
        'Маршрут менеджера', 'Маршрут производства', 'Маршрут монтажа',
        'реально доступные вкладки', 'Network',
        'Не передано → В производстве → Готово → Выдано',
        'Не назначен → Запланирован → В работе → Выполнен',
        'не появляется в `leader_*`', 'Production boundary',
        'nav_*', 'localStorage',
    ],
    status: [
        'локальный учебный заказ', 'не создаёт строки в Supabase',
        'ролевые маршруты', 'реально доступные вкладки',
        'запрещённый прямой переход',
    ],
    workflow: [
        'node tools/test_crm_training_scenario.mjs',
        'python3 tools/check_crm_training_scenario.py',
        'crm/v4/assets/v4/status-transitions-v1.js',
        'crm/v4/assets/v4/role-tab-permissions-v1.js',
        'crm/v4/assets/v4/action-permissions-v1.js',
        'node --check crm/v4/assets/v4/role-tab-permissions-v1.js',
        'crm/v4/assets/v4/site-cache-note-v1.js',
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
    if text.count('leader_crm_v4_training_scenario_v1') != 1:
        errors.append('Training scenario must keep one canonical localStorage key.')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM training scenario is role-aware, browser-local, registry-backed and protected from production writes.')
