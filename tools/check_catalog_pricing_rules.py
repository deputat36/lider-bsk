#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'docs' / 'CRM_CATALOG_PRICING_RULES_2026-07-01.md'
markers = [
    'CRM catalog pricing rules',
    'leader_catalog',
    'default_client_price',
    'markup_percent',
    'min_client_price',
    'catalog_snapshot',
    'single_line',
    'can_edit_catalog',
]
if not path.exists():
    print('Missing catalog pricing rules doc')
    sys.exit(1)
text = path.read_text(encoding='utf-8')
for marker in markers:
    if marker not in text:
        print(f'Missing marker: {marker}')
        sys.exit(1)
print('Catalog pricing rules markers are valid.')
