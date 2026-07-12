#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'docs' / 'PUBLIC_LANDING_FIRST_PAGE_MIGRATION.md'
NOTES = ROOT / 'docs' / 'PUBLIC_LANDING_PECHAT_BANNEROV_PATCH_NOTES.md'
PAGE = ROOT / 'pechat-bannerov-borisoglebsk.html'

for path in (PLAN, NOTES, PAGE):
    if not path.exists():
        print(str(path.relative_to(ROOT)) + ' is missing')
        sys.exit(1)

plan = PLAN.read_text(encoding='utf-8')
notes = NOTES.read_text(encoding='utf-8')
page = PAGE.read_text(encoding='utf-8')

required_docs = [
    '#185',
    '#191',
    '#195',
    'pechat-bannerov-borisoglebsk.html',
    'assets/public-landing.css',
    'assets/public-lead-form.js?v=5',
    'JSON-LD',
    'Баннер',
    '2026-07-12',
    'banner-dlya-magazina-borisoglebsk.html',
]
missing_docs = [item for item in required_docs if item not in plan + '\n' + notes]
if missing_docs:
    print('Missing completed first landing migration markers: ' + ', '.join(missing_docs))
    sys.exit(1)

required_page = [
    'assets/public-landing.css?v=1',
    'assets/public-lead-form.js?v=5',
    'data-leader-lead-form',
    "service.value='Баннер'",
    '<script type="application/ld+json">',
]
missing_page = [item for item in required_page if item not in page]
if missing_page:
    print('Missing migrated page markers: ' + ', '.join(missing_page))
    sys.exit(1)

for forbidden in (
    'assets/public-lead-form.js?v=4',
    ':root{--black:#1a1a1a',
    '*{box-sizing:border-box}',
):
    if forbidden in page:
        print('Stale first landing marker remains: ' + forbidden)
        sys.exit(1)

print('First public landing migration is completed and valid.')
