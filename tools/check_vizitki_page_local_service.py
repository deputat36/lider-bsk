#!/usr/bin/env python3
from pathlib import Path
import sys

page = (Path(__file__).resolve().parents[1] / 'vizitki-borisoglebsk.html').read_text(encoding='utf-8')
markers = [
    'function ensureOption',
    "ensureOption(service,'Визитки')",
    "service.value='Визитки'",
    'Заказ: визитки',
]
for marker in markers:
    if marker not in page:
        print('Missing marker: ' + marker)
        sys.exit(1)
print('Vizitki page locally sends service as VIZITKI.')
