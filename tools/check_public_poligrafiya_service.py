#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
page = (root / 'poligrafiya-borisoglebsk.html').read_text(encoding='utf-8')
form = (root / 'assets' / 'public-lead-form.js').read_text(encoding='utf-8')
checks = [
    ('page searches local Polygraphy option', "service.options[i].value==='Полиграфия'" in page),
    ('page adds local Polygraphy option fallback', "new Option('Полиграфия','Полиграфия')" in page),
    ('page sets local service to Polygraphy', "service.value='Полиграфия'" in page),
    ('page message mentions polygraphy', 'Страница: полиграфия' in page),
    ('form has polygraphy page preset', 'poligrafiya-borisoglebsk.html' in form and "service:'Полиграфия'" in form),
    ('form has Polygraphy option', '<option>Полиграфия</option>' in form),
]
failed = [name for name, ok in checks if not ok]
if failed:
    print('Missing checks: ' + '; '.join(failed))
    sys.exit(1)
print('Polygraphy page and public form send service as POLIGRAFIYA.')
