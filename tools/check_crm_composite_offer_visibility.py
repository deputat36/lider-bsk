#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CALC = ROOT / 'crm/v4/assets/v4/calculations.js'
COMPOSITE = ROOT / 'crm/v4/assets/v4/calculation-composite-model-v1.js'
OFFERS = ROOT / 'crm/v4/assets/v4/offers.js'
VISIBILITY = ROOT / 'crm/v4/assets/v4/offer-visibility-v1.js'

calc = CALC.read_text(encoding='utf-8')
composite = COMPOSITE.read_text(encoding='utf-8')
offers = OFFERS.read_text(encoding='utf-8')
visibility = VISIBILITY.read_text(encoding='utf-8')
errors = []

for marker in [
    "from './calculation-composite-model-v1.js'",
    "['composite', 'Составное изделие']",
    'renderCompositeComponentRow',
    'data-composite-component',
    'data-composite-field',
    'remove-composite-component',
    'compositeDraftValidation(',
    'compositeComponentsFromForm()',
]:
    if marker not in calc:
        errors.append(f'Missing composite calculation marker: {marker}')

render_start = calc.find("function renderModeFields(mode = 'banner') {")
render_end = calc.find('\nfunction area()', render_start)
if render_start < 0 or render_end < 0:
    errors.append('Cannot isolate renderModeFields for composite UI check')
else:
    render_region = calc[render_start:render_end]
    for marker in [
        "if (mode === 'composite')",
        '<b>Составное изделие:</b>',
        'calcCompositeTitle',
        'calcCompositeVisibility',
        'calcCompositeClient',
        'calcCompositeComponents',
        'calcCompositeAddComponentBtn',
        'renderCompositeComponentRow(0)',
    ]:
        if marker not in render_region:
            errors.append(f'Missing composite render marker: {marker}')

mode_start = calc.find('function currentModeItems()')
mode_end = calc.find('\nfunction renderSmartPreview()', mode_start)
if mode_start < 0 or mode_end < 0:
    errors.append('Cannot isolate currentModeItems for composite calculation check')
else:
    mode_region = calc[mode_start:mode_end]
    for marker in [
        "if (mode === 'composite')",
        'compositeDraftValidation(compositeInputFromForm())',
        "prepared.item.data.visibility === 'single_line'",
        'applyAutoPrice([prepared.item])',
    ]:
        if marker not in mode_region:
            errors.append(f'Missing composite calculation-path marker: {marker}')

for marker in [
    'CALCULATION_COMPOSITE_MODEL_V1',
    "mode: 'composite'",
    "calculation_mode: 'composite'",
    'components,',
    'component_count:',
    'visible_component_client_total',
    'compositeDraftValidation',
]:
    if marker not in composite:
        errors.append(f'Missing composite model marker: {marker}')

for marker in [
    "from './offer-visibility-v1.js'",
    'publicOfferRows(items)',
    'shortOfferItemNames(items, 8)',
    'offerVisibilityVersion()',
    'const visibleItems = publicItems(items);',
    'const shortNames = shortOfferItemNames(items, 8);',
]:
    if marker not in offers:
        errors.append(f'Missing offer visibility integration marker: {marker}')

legacy_public_items = "return (items || []).filter((item) => Number(item.client_sum || 0) > 0);"
if legacy_public_items in offers:
    errors.append('Legacy raw publicItems filter still bypasses offer visibility helper')

for marker in [
    "visibility === 'internal_only'",
    "visibility === 'detailed'",
    'component?.client_visible',
    "mode: 'detailed_component'",
    "mode: 'single_line'",
]:
    if marker not in visibility:
        errors.append(f'Missing offer visibility helper marker: {marker}')

start = offers.find('function buildOfferTexts')
end = offers.find('\nfunction ', start + 1)
if start < 0 or end < 0:
    errors.append('Cannot isolate buildOfferTexts for privacy check')
else:
    offer_builder = offers[start:end]
    for forbidden in ['contractor_price', 'contractor_sum', 'profit', 'margin_percent', 'markup_percent']:
        if forbidden in offer_builder:
            errors.append(f'Client offer builder exposes internal field marker: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Composite calculation and offer visibility integration contract: PASS')
