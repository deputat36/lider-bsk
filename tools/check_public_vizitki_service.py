#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
form = (root / 'assets' / 'public-lead-form.js').read_text(encoding='utf-8')
page = (root / 'vizitki-borisoglebsk.html').read_text(encoding='utf-8')
checks = [
    ('public-lead-form.js has service option', 'option>Визитки</option>' in form),
    ('public-lead-form.js has page preset', 'vizitki-borisoglebsk.html' in form and "service:'Визитки'" in form),
    ('vizitki page sets service to VIZITKI', "service.value='Визитки'" in page),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print('TODO: ' + '; '.join(failed))
    sys.exit(0)
print('Vizitki page sends service as VIZITKI.')
