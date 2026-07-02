#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
pages = [
    'uslugi.html',
    'bannery-borisoglebsk.html',
    'outdoor-advertising-borisoglebsk.html',
    'reklama-otkrytiya-magazina-borisoglebsk.html',
    'vizitki-borisoglebsk.html',
    'poligrafiya-borisoglebsk.html',
    'razdatochnye-materialy-borisoglebsk.html',
    'reklamnye-posty-vk-borisoglebsk.html',
    'audit-kart-yandex-2gis-borisoglebsk.html',
]
missing = []
for name in pages:
    text = (root / name).read_text(encoding='utf-8')
    if 'assets/public-lead-form.js?v=5' not in text:
        missing.append(name)
if missing:
    print('Pages without public lead form v5: ' + ', '.join(missing))
    sys.exit(1)
print('Partial public lead form cache v5 pages are valid.')
