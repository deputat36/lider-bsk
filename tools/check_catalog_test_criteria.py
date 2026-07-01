#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'docs' / 'CRM_CATALOG_TEST_CRITERIA_2026-07-01.md'
text = path.read_text(encoding='utf-8') if path.exists() else ''
for marker in ['catalog_id', 'calc-builder-v2', 'mode = catalog', 'single_line', 'catalog_snapshot', 'profit', 'margin']:
    if marker not in text:
        print('Missing marker: ' + marker)
        sys.exit(1)
print('Catalog test criteria are valid.')
