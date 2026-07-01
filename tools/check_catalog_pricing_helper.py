#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'crm' / 'v4' / 'assets' / 'v4' / 'catalog-pricing-v1.js'
markers = [
    'catalog-pricing-v1-20260701',
    'catalogClientUnitPrice',
    'catalogPricingSnapshot',
    'contractor_price',
    'markup_percent',
    'min_client_price',
    'default_client_price',
    'calculation_mode',
]
if not path.exists():
    print('Missing catalog pricing helper')
    sys.exit(1)
text = path.read_text(encoding='utf-8')
for marker in markers:
    if marker not in text:
        print(f'Missing marker: {marker}')
        sys.exit(1)
print('Catalog pricing helper markers are valid.')
