#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'crm' / 'v4' / 'assets' / 'v4' / 'offer-rules-v2.js'
markers = ['offer-rules-v2-20260701', 'OFFER_RULE_MODES_V2', 'single_line', 'detailed', 'internal_only']
if not path.exists():
    print('Missing offer rules v2 file')
    sys.exit(1)
text = path.read_text(encoding='utf-8')
for marker in markers:
    if marker not in text:
        print(f'Missing marker: {marker}')
        sys.exit(1)
print('Offer rules v2 markers are valid.')
