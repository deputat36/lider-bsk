#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'docs' / 'CRM_OFFER_VISIBILITY_INTEGRATION_2026-07-01.md'
markers = [
    'CRM offer visibility integration',
    'Related issues: #143, #145',
    'Implemented in the unified calculation / commercial-offer flow',
    'single_line',
    'detailed',
    'internal_only',
    'offer-visibility-v1.js',
    'publicOfferRows',
    'shortOfferItemNames',
    'leader_lead_calculation_items.data',
    'calculation-composite-model-v1.js',
    'data.components',
    'Supabase production is not changed',
    'contractor cost',
    'profit',
    'margin',
    'markup',
]
if not path.exists():
    print('Missing offer visibility integration doc')
    sys.exit(1)
text = path.read_text(encoding='utf-8')
for marker in markers:
    if marker not in text:
        print(f'Missing marker: {marker}')
        sys.exit(1)
if 'offers.js` still builds client text from all calculation items' in text:
    print('Obsolete pre-integration offer visibility state remains in documentation')
    sys.exit(1)
print('Offer visibility integration doc reflects the active composite/privacy contract.')
