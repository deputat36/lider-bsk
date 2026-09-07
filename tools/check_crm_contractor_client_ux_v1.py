#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CALC = ROOT / 'crm/v4/assets/v4/calculations.js'
MODEL = ROOT / 'crm/v4/assets/v4/calculation-contractor-quote-model-v1.js'
VISIBILITY = ROOT / 'crm/v4/assets/v4/offer-visibility-v1.js'
OFFERS = ROOT / 'crm/v4/assets/v4/offers.js'
PRINT = ROOT / 'crm/v4/assets/v4/offer-print-brand-v4.js'
REVIEW = ROOT / 'crm/v4/assets/v4/calculation-draft-review-v1.js'
CSS = ROOT / 'crm/v4/assets/v4/calculations-unified.css'

sources = {p: p.read_text(encoding='utf-8') for p in [CALC, MODEL, VISIBILITY, OFFERS, PRINT, REVIEW, CSS]}
calc = sources[CALC]
model = sources[MODEL]
visibility = sources[VISIBILITY]
offers = sources[OFFERS]
print_source = sources[PRINT]
review = sources[REVIEW]
css = sources[CSS]
errors = []


def require(source, markers, label):
    for marker in markers:
        if marker not in source:
            errors.append(f'{label}: missing {marker}')


require(calc, [
    "['contractor_quote', 'По цене подрядчика']",
    'calcContractorClientTitle',
    'calcContractorClientDescription',
    'calcContractorQty',
    'calcContractorUnit',
    'calcContractorVendor',
    'calcContractorBase',
    'contractorQuoteDraftValidation',
    'Что увидит клиент',
    'Клиент этого не увидит',
    'Укажите понятное название позиции для клиента',
    'PRIMARY_MODES',
    'TEMPLATE_MODES',
    'Ещё варианты: баннер, плёнка, ПВХ и другие шаблоны',
    'v4-mode-select-state',
    '1. Что считаем',
    '2. Состав',
    '3. Цена',
    '4. Сохранить',
    '<b>Для клиента:</b>',
    '<b>Внутренне:</b>',
], 'calculations')

for forbidden in [
    "title: val('calcTitle') || 'Подрядный заказ'",
    "name: textValue(input.title, 'Подрядный заказ')",
    "['contractor_quote', 'Подрядчик / готовая смета']",
]:
    if forbidden in calc or forbidden in model:
        errors.append('obsolete contractor client fallback/label remains: ' + forbidden)

require(model, [
    'contractor-quote-model-v1-20260907',
    'client_title: clientTitle',
    'client_description: clientDescription || null',
    'quoted_quantity: qty',
    'quoted_unit: unit',
    'manual_client_total:',
    'contractorQuoteDraftValidation',
    "errors.push('contractor_client_title_required')",
    "errors.push('contractor_cost_required')",
], 'contractor model')

require(visibility, [
    'offer-visibility-v1-20260907',
    'itemClientDescription',
    'data.client_description',
    'description: itemClientDescription(item)',
], 'offer visibility')
require(offers, ['if (item.description)', 'fullLines.push(`  ${item.description}`)'], 'offer text')
require(print_source, ['item.description', '${esc(item.description)}'], 'offer print')
require(review, ['calcContractorClientDescription', "mode === 'contractor_quote' ? 'По цене подрядчика'"], 'draft review')
require(css, ['.v4-contractor-client-card', '.v4-contractor-internal-card', '.v4-more-modes', '.v4-mode-select-state'], 'calculation css')

# The source order intentionally mirrors employee workflow. Price controls must not lead the form.
mode_pos = calc.find('<div class="v4-calc-auto-box">')
draft_pos = calc.find('<tbody id="calcDraftItems"></tbody>')
pricing_pos = calc.find('<section class="v4-pricing-control"')
save_pos = calc.find('<button id="saveCalculationBtn"')
if not (0 <= mode_pos < draft_pos < pricing_pos < save_pos):
    errors.append(f'workspace order drifted: mode={mode_pos}, draft={draft_pos}, pricing={pricing_pos}, save={save_pos}')

# Client projection is intentionally narrow; internal contractor data must never be copied into public rows.
for forbidden in ['vendor:', 'contractor_price:', 'contractor_sum:', 'profit:', 'margin_percent:']:
    public_rows_start = visibility.find('export function publicOfferRows')
    public_rows = visibility[public_rows_start:]
    if forbidden in public_rows:
        errors.append('offer projection leaks internal field: ' + forbidden)

if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print('Issue #514 contractor client UX: explicit client title/description, separated internal quote, simplified mode navigation and natural workspace order: PASS')
