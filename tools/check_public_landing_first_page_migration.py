#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
plan = root / 'docs' / 'PUBLIC_LANDING_FIRST_PAGE_MIGRATION.md'
notes = root / 'docs' / 'PUBLIC_LANDING_PECHAT_BANNEROV_PATCH_NOTES.md'
for doc in (plan, notes):
    if not doc.exists():
        print(str(doc.relative_to(root)) + ' is missing')
        sys.exit(1)
text = plan.read_text(encoding='utf-8') + '\n' + notes.read_text(encoding='utf-8')
required = [
    '#195',
    'pechat-bannerov-borisoglebsk.html',
    'assets/public-landing.css',
    'assets/public-lead-form.js?v=4',
    'assets/public-lead-form.js?v=5',
    'JSON-LD',
    'Баннер',
    'Do not touch CRM, nav, Supabase functions or database migrations',
    'normal working copy',
]
missing = [item for item in required if item not in text]
if missing:
    print('Missing first landing migration markers: ' + ', '.join(missing))
    sys.exit(1)
print('First public landing migration plan is valid.')
