#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
calc = (root / 'crm/v4/assets/v4/calculations.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/calculation-pricing-model-v1.js').read_text(encoding='utf-8')
errors = []

for forbidden in ['calculations-standard.js?', 'calculations-advanced.js?']:
    if forbidden in html: errors.append('Duplicate calculator remains connected: ' + forbidden)
for marker in ['calculations.js?v=20260715-need-prefill-2', 'calculations-unified.css?v=20260715-1']:
    if marker not in html: errors.append('Missing unified calculation asset: ' + marker)
for marker in ['Наценка к себестоимости', 'data-calc-markup="auto"', 'Своя наценка', 'Ручные цены позиций не изменяются', 'repriceAutomaticItems']:
    if marker not in calc: errors.append('Missing pricing UX marker: ' + marker)
for marker in ['marginPercentFromMarkup', 'price_source', 'manual', 'markupPercentForSubtotal']:
    if marker not in model: errors.append('Missing pricing model marker: ' + marker)
for forbidden in [".from('", '.insert(', '.update(', '.delete(', 'supabase/functions', 'supabase/migrations']:
    if forbidden in model: errors.append('Pricing model must be browser-only: ' + forbidden)

if errors:
    print('\n'.join(errors)); sys.exit(1)
print('CRM uses one calculation workspace with explicit browser-side pricing control.')
