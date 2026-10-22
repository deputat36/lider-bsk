#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys
root = Path(__file__).resolve().parents[1]
needs = (root / 'crm/v4/assets/v4/needs.js').read_text(encoding='utf-8')
calc = (root / 'crm/v4/assets/v4/calculations.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/need-calculation-prefill-v1.js').read_text(encoding='utf-8')
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
errors = []
for marker in ['Короткий бриф', 'Размер, материал и тираж', 'data-need-design-details', 'data-need-installation-details', 'data-action="calculate-need"', 'leader-v4:calculate-need']:
    if marker not in needs: errors.append('Missing simplified need marker: ' + marker)
for marker in ['needCalculationPrefill', 'applyNeedToCalculation', 'calcNeedId', 'calcWidth', 'calcHeight', 'calcQty', 'calcCustomName: prefill.title', 'calcCustomQty: prefill.quantity', 'calcServiceQty: prefill.quantity', "qty: num('calcServiceQty')", 'renderCalculationNeedContext', 'calcNeedContext', 'esc(need.description', 'CRM_V4_ACTIONS.NEEDS_READ', 'CRM_V4_ACTIONS.CALCULATIONS_WRITE']:
    if marker not in calc: errors.append('Missing calculation prefill marker: ' + marker)
handoff = calc.split('function applyNeedToCalculation(', 1)[1].split('\nfunction ', 1)[0]
if 'calcPublicComment' in handoff:
    errors.append('Internal need brief must not overwrite the client-facing calculation conditions')
for marker in ['item.lead_id === v4State.route.leadId', "item.status !== 'Архив'", 'needCalculationPrefill(currentNeed)', 'new Option(prefill.title, prefill.title)']:
    if marker not in handoff: errors.append('Missing canonical need handoff guard: ' + marker)
for marker in ['TYPE_MODE', 'numericNeedValue', "'Баннер': 'banner'", "'Полиграфия': 'photo'"]:
    if marker not in model: errors.append('Missing need mapping marker: ' + marker)
for forbidden in [".from('", '.insert(', '.update(', '.delete(']:
    if forbidden in model: errors.append('Prefill model must be browser-only: ' + forbidden)
if 'needs.js?v=20260721-duplicates-1' not in html or 'needs-brief.css?v=20260715-1' not in html or 'calculations.js?v=20260717-module-singleton-1' not in html: errors.append('Missing need brief cache marker')
if 'calculations.css?v=20261011-need-handoff-1' not in html:
    errors.append('Missing need context CSS cache version')
match = re.search(r'<script type="importmap">\s*(\{.*?\})\s*</script>', html, re.S)
imports = json.loads(match.group(1)).get('imports', {}) if match else {}
for suffix in ['', '?v=20260717-module-singleton-1', '?v=20260805-tab-loader-1', '?v=20260914-manual-zero-1', '?v=20260925-special-price-1']:
    if imports.get('./assets/v4/calculations.js' + suffix) != './assets/v4/calculations.js?v=20261022-recovery-1':
        errors.append('Calculation imports must share the current handoff module: ' + suffix)
if errors:
    print('\n'.join(errors)); sys.exit(1)
print('CRM need handoff contract is valid: exact item/quantity, internal brief, current-lead access guards and one cached calculation module.')
