#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
calc = (root / 'crm/v4/assets/v4/calculations.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/calculation-pricing-model-v1.js').read_text(encoding='utf-8')
spec_model = (root / 'crm/v4/assets/v4/calculation-spec-model-v1.js').read_text(encoding='utf-8')
review_model = (root / 'crm/v4/assets/v4/calculation-draft-review-model-v1.js').read_text(encoding='utf-8')
review = (root / 'crm/v4/assets/v4/calculation-draft-review-v1.js').read_text(encoding='utf-8')
review_css = (root / 'crm/v4/assets/v4/calculations-unified.css').read_text(encoding='utf-8')
errors = []

for forbidden in ['calculations-standard.js?', 'calculations-advanced.js?']:
    if forbidden in html: errors.append('Duplicate calculator remains connected: ' + forbidden)
for marker in [
    'calculations.js?v=20260717-load-integrity-1',
    'calculations-unified.css?v=20260715-draft-review-1',
    'calculation-draft-review-v1.js?v=20260715-1',
]:
    if marker not in html: errors.append('Missing unified calculation asset: ' + marker)
for marker in ['Наценка к себестоимости', 'data-calc-markup="auto"', 'Своя наценка', 'Ручные цены позиций не изменяются', 'repriceAutomaticItems']:
    if marker not in calc: errors.append('Missing pricing UX marker: ' + marker)
for marker in ['calcHemmingCost', 'calcGrommetCost', 'calcNeedPlotterCut', 'calcMountFilmCost', 'calcNeedSheetPrint', 'calcNeedSheetLamination', 'calcNeedSheetCut', 'ПВХ вспененный 20 мм', 'data-calc-row-field="contractor_price"', 'data-action="auto-calc-item"']:
    if marker not in calc: errors.append('Missing restored calculation setting: ' + marker)
for marker in ["['pvc_shapes', 'ПВХ-фигуры']", "['letters', 'Буквы / цифры']", 'calcPvcDiameters', 'calcLettersSpec', 'calcCustomCategory', 'calcCustomType', 'calcCustomData']:
    if marker not in calc: errors.append('Missing specialized calculation mode: ' + marker)
for marker in ['parseCalculationPairs', 'parseCalculationDiameters', 'circleAreaSquareMeters']:
    if marker not in spec_model: errors.append('Missing specification model marker: ' + marker)
for marker in ['marginPercentFromMarkup', 'price_source', 'manual', 'markupPercentForSubtotal']:
    if marker not in model: errors.append('Missing pricing model marker: ' + marker)
for marker in [
    'CLEAR_CONFIRMATION_WINDOW_MS',
    'calculationDraftClearDecision',
    'calculationDraftRowLabels',
    'calculationDraftReviewDescriptor',
    'reconcileCalculationDraftReview',
]:
    if marker not in review_model: errors.append('Missing draft review model marker: ' + marker)
for marker in [
    'MutationObserver',
    'v4-calc-draft-review-head',
    'v4-calc-row-review-meta',
    'v4-calc-row-characteristics',
    'aria-label',
    'Нажмите «Очистить» ещё раз в течение 4 секунд',
    'stopImmediatePropagation',
    'cell.dataset.label',
    'Автоматическая цена',
    'Ручная цена',
]:
    if marker not in review: errors.append('Missing draft review UX marker: ' + marker)
for marker in [
    '@media(max-width:720px)',
    '.v4-draft-review-table thead',
    'content:attr(data-label)',
    '.v4-calc-remove-row',
    '.v4-calc-draft-count',
    '.v4-calc-row-characteristics',
]:
    if marker not in review_css: errors.append('Missing responsive draft review style: ' + marker)
for source_name, source in [('pricing model', model), ('draft review model', review_model), ('draft review module', review)]:
    for forbidden in [".from('", '.insert(', '.update(', '.delete(', 'supabase/functions', 'supabase/migrations', 'service_role', 'sb_secret_']:
        if forbidden in source: errors.append(f'{source_name} must remain browser-only and no-write: {forbidden}')

if errors:
    print('\n'.join(errors)); sys.exit(1)
print('CRM uses one calculation workspace with explicit pricing and a responsive, accessible, clear-safe draft review.')
