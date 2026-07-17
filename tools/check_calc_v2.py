#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs' / 'CRM_CALCULATION_BUILDER_V2_2026-07-01.md'
shell = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculation-contractor-quote-v1.js'
visibility = root / 'crm' / 'v4' / 'assets' / 'v4' / 'offer-visibility-v1.js'
index = root / 'crm' / 'v4' / 'index.html'
saved_model = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculation-saved-review-model-v1.js'
saved_tools = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations-saved-tools-v2.js'
saved_css = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations-saved-tools.css'
saved_review_doc = root / 'docs' / 'CRM_SAVED_CALCULATION_REVIEW_2026-07-15.md'
checks = {
    doc: [
        'CRM calculation builder v2',
        'Tracking issue: #143',
        'client-facing positions',
        'contractor_quote',
        'single_line',
        'detailed',
        'internal_only',
        'leader_lead_calculations',
        'leader_lead_calculation_items',
        'leader_catalog',
        'leader_contractors',
        'Commercial offer rules',
    ],
    shell: [
        'contractor-quote-v1-20260701',
        'Подрядный расчёт v2',
        'contractorQuotePrepareBtn',
        'contractorQuoteBase',
        'contractorQuoteInstallation',
        'contractorQuoteClient',
    ],
    visibility: [
        'offer-visibility-v1-20260701',
        'publicOfferRows',
        'shortOfferItemNames',
        'single_line',
        'detailed',
        'internal_only',
        'client_visible',
    ],
    index: [
        'calculation-contractor-quote-v1.js?v=20260701-shell-1',
        'calculations-saved-tools.css?v=20260715-review-1',
        'calculations-saved-tools-v2.js?v=20260717-offer-next-1',
    ],
    saved_model: [
        'savedCalculationPositionLabel',
        'savedCalculationItemReview',
        'savedCalculationDetailsCopy',
        'pvc_shape_material',
        'letters',
        'price_source',
        'Ручная цена',
        'Автоматическая цена',
    ],
    saved_tools: [
        'savedCalculationItemReview',
        'savedCalculationPositionLabel',
        'Показать состав',
        'Обновить состав',
        'едином конструкторе',
        'data-label="Позиция"',
        'aria-expanded',
        'v4-saved-calc-item-tags',
        'v4-saved-calc-characteristics',
        'v4-saved-calc-count',
    ],
    saved_css: [
        '.v4-saved-calc-item-tags',
        '.v4-saved-calc-characteristics',
        '.v4-saved-calc-review-table',
        '@media(max-width:720px)',
        'content:attr(data-label)',
    ],
    saved_review_doc: [
        'Сохранённый состав расчёта',
        'едином конструкторе',
        'Mobile 360 и 390 px',
        'Network',
        'Supabase не изменяется',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        print(f'Missing file: {path.relative_to(root)}')
        sys.exit(1)
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            print(f'Missing marker in {path.relative_to(root)}: {marker}')
            sys.exit(1)

saved_model_text = saved_model.read_text(encoding='utf-8')
saved_tools_text = saved_tools.read_text(encoding='utf-8')
for forbidden in [".from('", '.insert(', '.update(', '.delete(', 'service_role', 'sb_secret_']:
    if forbidden in saved_model_text:
        print(f'Saved review model must remain pure browser presentation: {forbidden}')
        sys.exit(1)
for forbidden in ['.insert(', '.update(', '.delete(', 'service_role', 'sb_secret_']:
    if forbidden in saved_tools_text:
        print(f'Saved calculation review must remain read-only: {forbidden}')
        sys.exit(1)
if 'сначала типовой, затем нестандартный' in saved_tools_text:
    print('Obsolete two-calculator copy remains in saved calculations')
    sys.exit(1)

print('CRM calc v2 markers and saved calculation review are valid.')
