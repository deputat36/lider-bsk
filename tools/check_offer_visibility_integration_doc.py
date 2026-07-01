#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'docs' / 'CRM_OFFER_VISIBILITY_INTEGRATION_2026-07-01.md'
markers = [
    'CRM offer visibility integration',
    'Related issues: #143, #145',
    'single_line',
    'detailed',
    'internal_only',
    'offer-visibility-v1.js',
    'publicOfferRows',
    'shortOfferItemNames',
    'leader_lead_calculation_items.data',
    'leader_private.leader_has_access()',
]
if not path.exists():
    print('Missing offer visibility integration doc')
    sys.exit(1)
text = path.read_text(encoding='utf-8')
for marker in markers:
    if marker not in text:
        print(f'Missing marker: {marker}')
        sys.exit(1)
print('Offer visibility integration doc markers are valid.')
