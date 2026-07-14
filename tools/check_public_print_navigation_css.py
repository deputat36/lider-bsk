#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / 'assets' / 'public-print-navigation.css'
HUB = ROOT / 'poligrafiya-borisoglebsk.html'
CATALOG = ROOT / 'poligrafiya-katalog.html'

css = CSS.read_text(encoding='utf-8')
hub = HUB.read_text(encoding='utf-8')
catalog = CATALOG.read_text(encoding='utf-8')

if len(css) < 1900:
    raise SystemExit(f'Print navigation CSS is unexpectedly small: {len(css)} bytes')

for marker in (
    'body.page-print-hub{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;line-height:1.6;--page-max:1120px}',
    'body.page-print-catalog{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111827;--page-max:980px}',
    'body.page-print-hub .hero{background:linear-gradient(135deg,#111827,#0b0f17)',
    'body.page-print-catalog .hero{background:#111827;color:#fff;padding:48px 0}',
    'body.page-print-hub .grid{display:grid;grid-template-columns:repeat(3,1fr)',
    'body.page-print-catalog .links{display:grid;grid-template-columns:repeat(3,1fr)',
    '@media(max-width:800px){body.page-print-catalog .links{grid-template-columns:1fr}}',
):
    if marker not in css:
        raise SystemExit(f'Missing CSS marker: {marker}')

for name, html in (('hub', hub), ('catalog', catalog)):
    if '<style' in html.lower() or '</style>' in html.lower():
        raise SystemExit(f'{name}: inline style block returned')
    if re.search(r'\sstyle=["\']', html, flags=re.I):
        raise SystemExit(f'{name}: inline style attribute returned')
    if re.search(r'<script(?![^>]*\bsrc=)(?![^>]*type=["\']application/ld\+json["\'])[^>]*>', html, flags=re.I):
        raise SystemExit(f'{name}: unexpected executable inline script')
    if html.count('assets/public-print-navigation.css?v=1') != 1:
        raise SystemExit(f'{name}: shared stylesheet reference mismatch')

hub_markers = (
    '<body class="page-print-hub" data-lead-service="Полиграфия"',
    '<link rel="canonical" href="https://www.lider-bsk.ru/poligrafiya-borisoglebsk.html">',
    '<h1>Печатные материалы для бизнеса</h1>',
    '<h2>Рассчитать полиграфию</h2>',
    'assets/public-lead-form.css?v=4',
    'assets/public-lead-form.js?v=5',
    'assets/public-related-services.js?v=2',
    'assets/public-print-product.js?v=1',
    'id="leader-lead-form" data-leader-lead-form',
)
for marker in hub_markers:
    if marker not in hub:
        raise SystemExit(f'Hub marker missing: {marker}')
if hub.index('assets/public-lead-form.css?v=4') > hub.index('assets/public-print-navigation.css?v=1'):
    raise SystemExit('Hub page CSS must load after form CSS')
if hub.count('class="card"') != 6:
    raise SystemExit(f'Hub must preserve six cards, found {hub.count("class=\"card\"")}')

catalog_markers = (
    '<body class="page-print-catalog">',
    '<link rel="canonical" href="https://www.lider-bsk.ru/poligrafiya-katalog.html">',
    '<h1>Каталог полиграфии</h1>',
)
for marker in catalog_markers:
    if marker not in catalog:
        raise SystemExit(f'Catalog marker missing: {marker}')

catalog_targets = (
    'vizitki-borisoglebsk.html',
    'razdatochnye-materialy-borisoglebsk.html',
    'blanki-borisoglebsk.html',
    'buklety-borisoglebsk.html',
    'gramoty-borisoglebsk.html',
    'menyu-dlya-kafe-borisoglebsk.html',
    'otkrytki-priglasheniya-borisoglebsk.html',
    'kalendari-borisoglebsk.html',
    'birki-etiketki-borisoglebsk.html',
    'papki-konverty-borisoglebsk.html',
)
for target in catalog_targets:
    if catalog.count(f'href="{target}"') != 1:
        raise SystemExit(f'Catalog target mismatch: {target}')
if catalog.count('<a href=') != 11:
    raise SystemExit(f'Catalog must preserve back link plus ten product links, found {catalog.count("<a href=")}')

print('Shared print navigation CSS contract is valid for hub and catalog pages.')
