#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs' / 'CRM_CALCULATION_BUILDER_V2_2026-07-01.md'
calculations = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations.js'
contractor_model = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculation-contractor-quote-model-v1.js'
composite_model = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculation-composite-model-v1.js'
visibility = root / 'crm' / 'v4' / 'assets' / 'v4' / 'offer-visibility-v1.js'
offers = root / 'crm' / 'v4' / 'assets' / 'v4' / 'offers.js'
index = root / 'crm' / 'v4' / 'index.html'
loader = root / 'crm' / 'v4' / 'assets' / 'v4' / 'crm-v4-tab-loader-v1.js'
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
        'Commercial offer rules',
    ],
    calculations: [
        "['contractor_quote', 'Подрядчик / готовая смета']",
        "['composite', 'Составное изделие']",
        'calcContractorVendor',
        'calcContractorBase',
        'calcContractorDelivery',
        'calcContractorInstallation',
        'calcContractorDesign',
        'calcContractorOther',
        'calcContractorClient',
        'contractorQuoteDraftItem',
        'compositeDraftValidation',
        'calcCompositeComponents',
        'calcCompositeVisibility',
        'Общая наценка задаётся выше',
    ],
    contractor_model: [
        'contractor-quote-model-v1-20260903',
        "builder_version: 'calc-builder-v2'",
        "mode: 'contractor_quote'",
        "calculation_mode: 'contractor_quote'",
        "visibility: 'single_line'",
        'contractor_quote:',
        'price_source:',
    ],
    composite_model: [
        'calculation-composite-model-v1-20260904',
        "builder_version: 'calc-builder-v2'",
        "mode: 'composite'",
        "calculation_mode: 'composite'",
        'components,',
        'component_count:',
        'visible_component_client_total',
    ],
    visibility: [
        'offer-visibility-v1-20260904',
        'publicOfferRows',
        'shortOfferItemNames',
        'single_line',
        'detailed',
        'internal_only',
        'client_visible',
    ],
    offers: [
        "from './offer-visibility-v1.js'",
        'return publicOfferRows(items);',
        'shortOfferItemNames(items, 8)',
        'offerVisibilityVersion()',
    ],
    index: [
        'calculations-saved-tools.css?v=20260715-review-1',
        'calculations-saved-tools-v2.js?v=20260717-load-integrity-1',
    ],
    loader: [
        "import('./calculations.js?v=20260805-tab-loader-1')",
        "modules[5].bootCalculations?.()",
        "modules[7].bootOffers?.()",
        "modules[8].bootOrders?.()",
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

index_text = index.read_text(encoding='utf-8')
loader_text = loader.read_text(encoding='utf-8')
for legacy in ['calculation-contractor-quote-v1.js?v=', 'contractorQuotePrepareBtn']:
    if legacy in index_text or legacy in loader_text:
        print(f'Legacy contractor quote shell still wired: {legacy}')
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

print('CRM calc v2 markers, unified contractor/composite modes and offer visibility are valid.')
