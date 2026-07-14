#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
page = (root / 'vizitki-borisoglebsk.html').read_text(encoding='utf-8')
builder = (root / 'assets' / 'public-business-card-builder.js').read_text(encoding='utf-8')

page_markers = [
    'assets/public-business-card-builder.js?v=1',
    'id="send-card-summary"',
    'id="leader-lead-form" data-leader-lead-form',
]
builder_markers = [
    'function ensureOption',
    "ensureOption(service, 'Визитки')",
    "service.value = 'Визитки'",
    "'Заказ: визитки'",
]
for marker in page_markers:
    if marker not in page:
        raise SystemExit('Missing page marker: ' + marker)
for marker in builder_markers:
    if marker not in builder:
        raise SystemExit('Missing builder marker: ' + marker)
print('Vizitki page locally sends service as VIZITKI through the external builder asset.')
