#!/usr/bin/env python3
from pathlib import Path
import sys

path = Path(__file__).resolve().parents[1] / 'assets' / 'public-lead-form.js'
text = path.read_text(encoding='utf-8') if path.exists() else ''
changed = False

preset = "    'vizitki-borisoglebsk.html':{service:'Визитки',text:'Страница услуги: визитки. Нужно уточнить тираж, формат, стороны печати, бумагу, ламинацию, макет и сроки.'},\n"
anchor = "    'logotip-firmennyy-stil.html':{service:'Логотип / фирменный стиль',text:'Страница услуги: логотип и фирменный стиль. Нужно уточнить направление бизнеса, пожелания по стилю и где будет использоваться логотип.'},\n"
if "'vizitki-borisoglebsk.html'" not in text:
    if anchor not in text:
        print('Could not find preset anchor')
        sys.exit(1)
    text = text.replace(anchor, anchor + preset, 1)
    changed = True

old = '<option>Баннер</option><option>Наклейки</option>'
new = '<option>Баннер</option><option>Визитки</option><option>Наклейки</option>'
if '<option>Визитки</option>' not in text:
    if old not in text:
        print('Could not find service select anchor')
        sys.exit(1)
    text = text.replace(old, new, 1)
    changed = True

if changed:
    path.write_text(text, encoding='utf-8')
    print('Patched public lead form for vizitki service')
else:
    print('public-lead-form.js already supports vizitki service')
