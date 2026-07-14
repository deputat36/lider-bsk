#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'vizitki-borisoglebsk.html'
CSS = ROOT / 'assets' / 'public-business-card-builder.css'
JS = ROOT / 'assets' / 'public-business-card-builder.js'

html = PAGE.read_text(encoding='utf-8')
css = CSS.read_text(encoding='utf-8')
js = JS.read_text(encoding='utf-8')

if len(css) < 900:
    raise SystemExit(f'Business card builder CSS is unexpectedly small: {len(css)} bytes')
if len(js) < 1500:
    raise SystemExit(f'Business card builder JS is unexpectedly small: {len(js)} bytes')

for marker in (
    '.back-link,.phone-link{color:#fff}',
    '.calc{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
    '.summary{white-space:pre-line;background:#111827;color:#fff',
    '.cta{background:#111827;color:#fff;border-radius:30px',
    '@media(max-width:900px){.grid,.calc,.cta{grid-template-columns:1fr}',
):
    if marker not in css:
        raise SystemExit(f'Missing CSS marker: {marker}')

for marker in (
    "'Заказ: визитки'",
    "'Вид: ' + valueOf('kind')",
    "'Макет / дизайн: ' + valueOf('design')",
    "ensureOption(service, 'Визитки')",
    "message.value = buildSummary()",
    "requestSection.scrollIntoView({behavior:'smooth'})",
):
    if marker not in js:
        raise SystemExit(f'Missing JS marker: {marker}')

if '<style' in html.lower() or '</style>' in html.lower():
    raise SystemExit('Inline style block returned to business card page')
if re.search(r'\sstyle=["\']', html, flags=re.I):
    raise SystemExit('Inline style attribute returned to business card page')
if re.search(r'<script(?![^>]*\bsrc=)(?![^>]*type=["\']application/ld\+json["\'])[^>]*>', html, flags=re.I):
    raise SystemExit('Executable inline script returned to business card page')

assets = (
    'assets/public-lead-form.css?v=4',
    'assets/public-business-card-builder.css?v=1',
    'assets/public-lead-form.js?v=5',
    'assets/public-related-services.js?v=1',
    'assets/public-business-card-builder.js?v=1',
)
for asset in assets:
    if html.count(asset) != 1:
        raise SystemExit(f'Expected exactly one asset reference: {asset}')

if html.index(assets[0]) > html.index(assets[1]):
    raise SystemExit('Page CSS must load after shared form CSS')
if not (html.index(assets[2]) < html.index(assets[3]) < html.index(assets[4])):
    raise SystemExit('Business card scripts are in the wrong order')

required_page_markers = (
    '<body class="page-business-card-builder">',
    '<link rel="canonical" href="https://www.lider-bsk.ru/vizitki-borisoglebsk.html">',
    '<h1>Визитки в Борисоглебске</h1>',
    '<h2>Конструктор заказа визиток</h2>',
    '<h2>Рассчитать визитки</h2>',
    'id="card-calc"',
    'id="card-summary" aria-live="polite"',
    'id="send-card-summary" type="button"',
    'id="leader-lead-form" data-leader-lead-form',
    'href="tel:+79802457471"',
)
for marker in required_page_markers:
    if marker not in html:
        raise SystemExit(f'Missing page marker: {marker}')

fields = {
    'kind': 'card-kind',
    'format': 'card-format',
    'sides': 'card-sides',
    'qty': 'card-qty',
    'paper': 'card-paper',
    'lamination': 'card-lamination',
    'corners': 'card-corners',
    'design': 'card-design',
}
for calc_name, field_id in fields.items():
    if html.count(f'data-calc="{calc_name}"') != 1:
        raise SystemExit(f'Field {calc_name} must occur exactly once')
    if html.count(f'id="{field_id}"') != 1:
        raise SystemExit(f'Field id {field_id} must occur exactly once')
    if html.count(f'for="{field_id}"') != 1:
        raise SystemExit(f'Label for {field_id} must occur exactly once')

if html.count('<select') != 8:
    raise SystemExit(f'Expected eight builder selects, found {html.count("<select")}')

print('Business card builder assets and accessibility contract are valid.')
