#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'tools' / 'patch_calculations_catalog_id.py'
text = path.read_text(encoding='utf-8') if path.exists() else ''
for marker in ['patch_calculations_catalog_id.py', 'raw.catalog_id', 'catalog_id', 'calcItem return block', 'calculations.js']:
    if marker not in text:
        print('Missing marker: ' + marker)
        sys.exit(1)
print('Catalog id patch script is valid.')
