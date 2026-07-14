#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
form = (root / 'assets' / 'public-lead-form.js').read_text(encoding='utf-8')
page = (root / 'vizitki-borisoglebsk.html').read_text(encoding='utf-8')
builder = (root / 'assets' / 'public-business-card-builder.js').read_text(encoding='utf-8')

checks = [
    ('public-lead-form.js has service option', 'option>Визитки</option>' in form),
    ('public-lead-form.js has page preset', 'vizitki-borisoglebsk.html' in form and "service:'Визитки'" in form),
    ('vizitki page loads external builder', 'assets/public-business-card-builder.js?v=1' in page),
    ('builder selects VIZITKI service', "ensureOption(service, 'Визитки')" in builder and "service.value = 'Визитки'" in builder),
]
failed = [name for name, ok in checks if not ok]
if failed:
    raise SystemExit('Missing contract: ' + '; '.join(failed))
print('Vizitki page sends service as VIZITKI through the external builder asset.')
