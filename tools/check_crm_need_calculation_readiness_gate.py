#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'crm/v4/assets/v4/need-calculation-readiness-v1.js'
NEEDS = ROOT / 'crm/v4/assets/v4/needs.js'
LOADER = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'

errors = []
for path in (MODEL, NEEDS, LOADER):
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

model = MODEL.read_text(encoding='utf-8')
needs = NEEDS.read_text(encoding='utf-8')
loader = LOADER.read_text(encoding='utf-8')

for marker in [
    'NEED_CALCULATION_READY_THRESHOLD = 80',
    'normalizeNeedMissingFields',
    'normalizeNeedCompletenessScore',
    'needCalculationReadiness',
    'needCalculationGateDecision',
    "action: 'review'",
    "action: 'calculate'",
]:
    if marker not in model:
        errors.append('Model missing marker: ' + marker)

for forbidden in ["supabaseClient", ".from('", '.insert(', '.update(', '.delete(', 'functions.invoke', 'fetch(']:
    if forbidden in model:
        errors.append('Readiness model must remain side-effect free: ' + forbidden)

for marker in [
    "from './need-calculation-readiness-v1.js'",
    'calculationGateNeedId',
    'needCalculationGateDecision(need)',
    'data-need-calculation-gate',
    'Перед расчётом проверьте потребность',
    'data-action="calculate-need-anyway"',
    'Продолжить всё равно',
    'data-action="cancel-calculate-need"',
    "continueAnyway: true",
    "new CustomEvent('leader-v4:calculate-need'",
]:
    if marker not in needs:
        errors.append('Needs UI missing marker: ' + marker)

if 'window.confirm(' in needs or 'window.alert(' in needs:
    errors.append('Readiness gate must be inline, not blocking browser dialogs')

if "import('./needs.js?v=20260907-readiness-gate-1')" not in loader:
    errors.append('Lazy lead-card loader must cache-bust the readiness-gate needs module')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM need→calculation readiness gate is soft, explicit, browser-only and cache-safe.')
