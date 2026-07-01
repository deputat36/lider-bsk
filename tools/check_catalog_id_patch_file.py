#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'patches' / 'crm-catalog-id-calcitem.patch'
text = path.read_text(encoding='utf-8') if path.exists() else ''
for marker in ['calculations.js', 'function calcItem(raw, index)', 'catalog_id: raw.catalog_id || null', 'category: raw.category']:
    if marker not in text:
        print('Missing marker: ' + marker)
        sys.exit(1)
print('Catalog id patch file is valid.')
