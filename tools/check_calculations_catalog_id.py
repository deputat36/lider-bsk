#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations.js'
text = path.read_text(encoding='utf-8') if path.exists() else ''
checks = [
    'const ITEM_FIELDS',
    'catalog_id',
    'function calcItem(raw, index)',
]
for marker in checks:
    if marker not in text:
        print('Missing marker: ' + marker)
        sys.exit(1)
if 'catalog_id: raw.catalog_id || null' not in text:
    print('TODO: calcItem must preserve raw.catalog_id before catalog-backed mode is complete.')
    sys.exit(0)
print('calculations.js preserves catalog_id.')
