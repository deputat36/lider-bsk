#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs' / 'CRM_CALCULATION_BUILDER_V2_2026-07-01.md'
shell = root / 'crm' / 'v4' / 'assets' / 'v4' / 'calculation-contractor-quote-v1.js'
visibility = root / 'crm' / 'v4' / 'assets' / 'v4' / 'offer-visibility-v1.js'
index = root / 'crm' / 'v4' / 'index.html'
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
print('CRM calc v2 markers are valid.')
