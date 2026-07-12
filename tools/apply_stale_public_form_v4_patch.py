#!/usr/bin/env python3
from pathlib import Path

TARGETS = (
    Path('nakleyki-plotternaya-rezka-borisoglebsk.html'),
    Path('socseti-kontent.html'),
    Path('tablichki-borisoglebsk.html'),
    Path('yandex-karty-2gis.html'),
)
OLD = 'assets/public-lead-form.js?v=4'
NEW = 'assets/public-lead-form.js?v=5'

for path in TARGETS:
    text = path.read_text(encoding='utf-8')
    count = text.count(OLD)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one {OLD}, found {count}')
    if text.count('assets/public-lead-form.js') != 1:
        raise SystemExit(f'{path}: public form script must be connected exactly once')
    path.write_text(text.replace(OLD, NEW, 1), encoding='utf-8')

for path in TARGETS:
    text = path.read_text(encoding='utf-8')
    if OLD in text or text.count(NEW) != 1:
        raise SystemExit(f'{path}: cache marker replacement validation failed')

print('Updated four remaining public form pages from v4 to v5.')
