#!/usr/bin/env python3
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
CORE_SCRIPT = 'assets/public-lead-form.js?v=23'
V28_SCRIPT = 'assets/public-lead-form.js?v=28'
V5_SCRIPT = 'assets/public-lead-form.js?v=5'
V4_SCRIPT = 'assets/public-lead-form.js?v=4'

CORE_PAGES = (
    'index.html',
    'request.html',
    'uslugi.html',
    'prices.html',
    'kontakty.html',
)

V5_PAGES = (
    'kak-prohodit-zakaz.html',
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

V28_PAGES = (
    'banner-dlya-magazina-borisoglebsk.html',
    'oformlenie-vhoda-borisoglebsk.html',
    'nakleyki-na-vitrinu-borisoglebsk.html',
    'rezhim-raboty-tablichki-borisoglebsk.html',
    'outdoor-advertising-borisoglebsk.html',
    'reklama-otkrytiya-magazina-borisoglebsk.html',
)

EXPECTED_SCRIPTS = {
    **{name: CORE_SCRIPT for name in CORE_PAGES},
    **{name: V5_SCRIPT for name in V5_PAGES},
    **{name: V28_SCRIPT for name in V28_PAGES},
}

errors = []

for name, expected_script in EXPECTED_SCRIPTS.items():
    path = ROOT / name
    if not path.is_file():
        errors.append(f'Missing public page: {name}')
        continue

    text = path.read_text(encoding='utf-8')
    if text.count(expected_script) != 1:
        errors.append(f'{name}: expected exactly one {expected_script}')
    if V4_SCRIPT in text:
        errors.append(f'{name}: stale {V4_SCRIPT} reference remains')
    if text.count('assets/public-lead-form.js') != 1:
        errors.append(f'{name}: public lead form script must be connected exactly once')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print(
    'Public lead form cache coverage is valid: '
    f'{len(CORE_PAGES)} core pages on v23, {len(V5_PAGES)} gradual-migration pages on v5 '
    f'and {len(V28_PAGES)} related commercial pages on v28.'
)
