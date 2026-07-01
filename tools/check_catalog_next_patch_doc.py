#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'docs' / 'CRM_CATALOG_BACKED_NEXT_PATCH_2026-07-01.md'
text = path.read_text(encoding='utf-8') if path.exists() else ''
markers = [
    'catalogDraftItem',
    'catalogClientUnitPrice',
    'raw.catalog_id',
    'makeRawItem()',
    'leader_catalog',
    'CATALOG',
    'catalog_id = null',
]
for marker in markers:
    if marker not in text:
        print('Missing marker: ' + marker)
        sys.exit(1)
print('Catalog next patch doc is valid.')
