#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'crm' / 'v4' / 'assets' / 'v4' / 'calculations.js'
text = path.read_text(encoding='utf-8') if path.exists() else ''
needle = "  return {\n    category: raw.category || 'Расчёт по позиции',"
replacement = "  return {\n    catalog_id: raw.catalog_id || null,\n    category: raw.category || 'Расчёт по позиции',"
if replacement in text:
    print('calculations.js already preserves catalog_id')
    sys.exit(0)
if needle not in text:
    print('Could not find calcItem return block')
    sys.exit(1)
path.write_text(text.replace(needle, replacement, 1), encoding='utf-8')
print('Patched calculations.js to preserve catalog_id')
