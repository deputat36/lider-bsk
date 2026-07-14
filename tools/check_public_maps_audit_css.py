#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'audit-kart-yandex-2gis-borisoglebsk.html'
CSS = ROOT / 'assets' / 'public-maps-audit.css'

html = PAGE.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')

if len(css) < 1700:
    raise SystemExit(f'Maps audit CSS is unexpectedly small: {len(css)} bytes')

for marker in (
    '.top,.footer{background:#0d0f12;color:#fff}',
    '.hero-grid,.cta{display:grid;grid-template-columns:1fr 1fr;gap:28px}',
    '.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}',
    '.price{font-size:32px;font-weight:900}',
    '@media(max-width:900px){.hero-grid,.grid3,.cta{grid-template-columns:1fr}.nav{display:none}}',
):
    if marker not in css:
        raise SystemExit(f'Missing maps audit CSS marker: {marker}')

if '<style' in html.lower() or '</style>' in html.lower():
    raise SystemExit('Maps audit inline style block returned')
if re.search(
    r'<script(?![^>]*\bsrc=)(?![^>]*\btype=["\']application/ld\+json["\'])[^>]*>',
    html,
    flags=re.I,
):
    raise SystemExit('Executable inline JavaScript is not allowed on maps audit page')

form_css = 'assets/public-lead-form.css?v=4'
page_css = 'assets/public-maps-audit.css?v=1'
form_js = 'assets/public-lead-form.js?v=5'
for marker in (form_css, page_css, form_js):
    if html.count(marker) != 1:
        raise SystemExit(f'Expected exactly one {marker}')
if html.index(form_css) > html.index(page_css):
    raise SystemExit('Maps audit CSS must load after form CSS')

for marker in (
    '<link rel="canonical" href="https://www.lider-bsk.ru/audit-kart-yandex-2gis-borisoglebsk.html">',
    '<h1>Аудит Яндекс Карт и 2ГИС в Борисоглебске</h1>',
    '<h2>Что проверим</h2>',
    '<h2>Почему это важно</h2>',
    '<h2>Ориентиры по цене</h2>',
    '<h2>Проверить карточки в картах</h2>',
    'data-service="Яндекс Карты и 2ГИС"',
    'id="leader-lead-form"',
    'href="tel:+79802457471"',
    'href="privacy.html"',
    '"@type":"Service"',
):
    if marker not in html:
        raise SystemExit(f'Missing maps audit page marker: {marker}')

if html.count('class="card"') != 6:
    raise SystemExit('Maps audit page must keep six cards')
for price in ('от 1 000 ₽', 'от 2 000 ₽', 'от 3 500 ₽'):
    if html.count(price) != 1:
        raise SystemExit(f'Maps audit price changed or duplicated: {price}')

print('Maps audit page CSS contract is valid.')
