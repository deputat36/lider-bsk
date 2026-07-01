#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
path = root / 'docs' / 'CRM_CONTRACTOR_QUOTE_PERSISTENCE_2026-07-01.md'
markers = [
    'CRM contractor quote persistence',
    'Related issues: #143, #144',
    'leader_lead_calculations',
    'leader_lead_calculation_items',
    'builder_version',
    'contractor_quote',
    'single_line',
    'Rollback rule',
    'leader_private.leader_has_access()',
]
if not path.exists():
    print('Missing contractor quote persistence doc')
    sys.exit(1)
text = path.read_text(encoding='utf-8')
for marker in markers:
    if marker not in text:
        print(f'Missing marker: {marker}')
        sys.exit(1)
print('Contractor quote persistence doc markers are valid.')
