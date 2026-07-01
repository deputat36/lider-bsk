#!/usr/bin/env python3
from pathlib import Path
import sys
p = Path(__file__).resolve().parents[1] / 'docs' / 'CRM_CATALOG_TO_CALC_ITEM_MAPPING_2026-07-01.md'
text = p.read_text(encoding='utf-8') if p.exists() else ''
for m in ['catalog_id', 'contractor_sum', 'client_price', 'client_sum', 'margin_percent', 'calc-builder-v2', 'single_line', 'raw.catalog_id']:
    if m not in text:
        print('Missing marker: ' + m)
        sys.exit(1)
print('Catalog mapping is valid.')
