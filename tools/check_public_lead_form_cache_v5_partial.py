#!/usr/bin/env python3
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
V5_SCRIPT = 'assets/public-lead-form.js?v=5'
V4_SCRIPT = 'assets/public-lead-form.js?v=4'

# Public pages already migrated to the current shared lead-form cache version.
# Large inline-CSS pages tracked in #191/#195 are intentionally excluded until
# they can be shortened and updated without a risky full-file replacement.
V5_PAGES = (
    'uslugi.html',
    'kontakty.html',
    'kak-prohodit-zakaz.html',
    'bannery-borisoglebsk.html',
    'outdoor-advertising-borisoglebsk.html',
    'reklama-otkrytiya-magazina-borisoglebsk.html',
    'vizitki-borisoglebsk.html',
    'poligrafiya-borisoglebsk.html',
    'razdatochnye-materialy-borisoglebsk.html',
    'blanki-borisoglebsk.html',
    'buklety-borisoglebsk.html',
    'gramoty-borisoglebsk.html',
    'menyu-dlya-kafe-borisoglebsk.html',
    'otkrytki-priglasheniya-borisoglebsk.html',
    'kalendari-borisoglebsk.html',
    'birki-etiketki-borisoglebsk.html',
    'papki-konverty-borisoglebsk.html',
    'reklamnye-posty-vk-borisoglebsk.html',
    'audit-kart-yandex-2gis-borisoglebsk.html',
)

errors = []

for name in V5_PAGES:
    path = ROOT / name
    if not path.is_file():
        errors.append(f'Missing public page: {name}')
        continue

    text = path.read_text(encoding='utf-8')
    if text.count(V5_SCRIPT) != 1:
        errors.append(f'{name}: expected exactly one {V5_SCRIPT}')
    if V4_SCRIPT in text:
        errors.append(f'{name}: stale {V4_SCRIPT} reference remains')
    if text.count('assets/public-lead-form.js') != 1:
        errors.append(f'{name}: public lead form script must be connected exactly once')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print(f'Public lead form cache v5 coverage is valid for {len(V5_PAGES)} pages.')
