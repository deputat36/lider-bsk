#!/usr/bin/env python3
from pathlib import Path
import sys

page = (Path(__file__).resolve().parents[1] / 'poligrafiya-borisoglebsk.html').read_text(encoding='utf-8')
markers = [
    "service.options[i].value==='Полиграфия'",
    "new Option('Полиграфия','Полиграфия')",
    "service.value='Полиграфия'",
    'Страница: полиграфия',
]
for marker in markers:
    if marker not in page:
        print('Missing marker: ' + marker)
        sys.exit(1)
print('Polygraphy page sends service as POLIGRAFIYA.')
