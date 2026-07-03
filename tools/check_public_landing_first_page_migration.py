#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs' / 'PUBLIC_LANDING_FIRST_PAGE_MIGRATION.md'
if not doc.exists():
    print('docs/PUBLIC_LANDING_FIRST_PAGE_MIGRATION.md is missing')
    sys.exit(1)
text = doc.read_text(encoding='utf-8')
required = [
    '#195',
    'pechat-bannerov-borisoglebsk.html',
    'assets/public-landing.css',
    'assets/public-lead-form.js?v=4',
    'assets/public-lead-form.js?v=5',
    'JSON-LD',
    'Баннер',
    'Do not touch CRM, nav, Supabase functions or database migrations',
]
missing = [item for item in required if item not in text]
if missing:
    print('Missing first landing migration markers: ' + ', '.join(missing))
    sys.exit(1)
print('First public landing migration plan is valid.')
