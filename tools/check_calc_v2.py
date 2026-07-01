#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs' / 'CRM_CALCULATION_BUILDER_V2_2026-07-01.md'
markers = [
    'CRM calculation builder v2',
    'Tracking issue: #143',
    'client-facing positions',
    'contractor_quote',
    'single_line',
    'detailed',
    'internal_only',
    'leader_lead_calculations',
    'leader_lead_calculation_items',
    'leader_catalog',
    'leader_contractors',
    'Commercial offer rules',
]

if not doc.exists():
    print(f'Missing file: {doc.relative_to(root)}')
    sys.exit(1)
text = doc.read_text(encoding='utf-8')
for marker in markers:
    if marker not in text:
        print(f'Missing marker: {marker}')
        sys.exit(1)
print('CRM calc v2 markers are valid.')
