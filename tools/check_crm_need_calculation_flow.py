#!/usr/bin/env python3
from pathlib import Path
import sys
root = Path(__file__).resolve().parents[1]
needs = (root / 'crm/v4/assets/v4/needs.js').read_text(encoding='utf-8')
calc = (root / 'crm/v4/assets/v4/calculations.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/need-calculation-prefill-v1.js').read_text(encoding='utf-8')
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
errors = []
for marker in ['Короткий бриф', 'Размер, материал и тираж', 'data-need-design-details', 'data-need-installation-details', 'data-action="calculate-need"', 'leader-v4:calculate-need']:
    if marker not in needs: errors.append('Missing simplified need marker: ' + marker)
for marker in ['needCalculationPrefill', 'applyNeedToCalculation', 'calcNeedId', 'calcWidth', 'calcHeight', 'calcQty']:
    if marker not in calc: errors.append('Missing calculation prefill marker: ' + marker)
for marker in ['TYPE_MODE', 'numericNeedValue', "'Баннер': 'banner'", "'Полиграфия': 'photo'"]:
    if marker not in model: errors.append('Missing need mapping marker: ' + marker)
for forbidden in [".from('", '.insert(', '.update(', '.delete(']:
    if forbidden in model: errors.append('Prefill model must be browser-only: ' + forbidden)
if 'needs.js?v=20260721-duplicates-1' not in html or 'needs-brief.css?v=20260715-1' not in html or 'calculations.js?v=20260717-module-singleton-1' not in html: errors.append('Missing need brief cache marker')
if errors:
    print('\n'.join(errors)); sys.exit(1)
print('CRM need brief and calculation prefill contract is valid.')
