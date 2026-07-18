#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / 'assets' / 'public-business-segment.css'
PAGES = {
    'reklama-dlya-magazina-borisoglebsk.html': {
        'body_class': 'page-business-shop',
        'canonical': 'https://www.lider-bsk.ru/reklama-dlya-magazina-borisoglebsk.html',
        'h1': 'Реклама для магазина в Борисоглебске',
        'cta': 'Рассчитать рекламу для магазина',
        'form_css': 'assets/public-lead-form.css?v=15',
        'form_js': 'assets/public-lead-form.js?v=27',
        'cards': 14,
    },
    'reklama-dlya-kafe-borisoglebsk.html': {
        'body_class': 'page-business-cafe',
        'canonical': 'https://www.lider-bsk.ru/reklama-dlya-kafe-borisoglebsk.html',
        'h1': 'Реклама для кафе, кофейни и доставки в Борисоглебске',
        'cta': 'Рассчитать рекламу для кафе или доставки',
        'form_css': 'assets/public-lead-form.css?v=18',
        'form_js': 'assets/public-lead-form.js?v=18',
        'cards': 14,
    },
    'reklama-dlya-salona-krasoty-borisoglebsk.html': {
        'body_class': 'page-business-beauty',
        'canonical': 'https://www.lider-bsk.ru/reklama-dlya-salona-krasoty-borisoglebsk.html',
        'h1': 'Реклама для салона красоты, студии и частного мастера',
        'cta': 'Рассчитать рекламу для салона или мастера',
        'form_css': 'assets/public-lead-form.css?v=20',
        'form_js': 'assets/public-lead-form.js?v=20',
        'cards': 17,
    },
    'reklama-dlya-servisa-masterskoy-borisoglebsk.html': {
        'body_class': 'page-business-service',
        'canonical': 'https://www.lider-bsk.ru/reklama-dlya-servisa-masterskoy-borisoglebsk.html',
        'h1': 'Реклама для сервиса, ремонта и мастерской',
        'cta': 'Рассчитать рекламу для сервиса',
        'form_css': 'assets/public-lead-form.css?v=21',
        'form_js': 'assets/public-lead-form.js?v=21',
        'cards': 17,
    },
}

css = CSS.read_text(encoding='utf-8')
if len(css) < 3000:
    raise SystemExit(f'Business segment CSS is unexpectedly small: {len(css)} bytes')

for marker in (
    'body{--hero-copy-max:980px;--lead-copy-max:920px',
    'body.page-business-shop{--hero-copy-max:940px;--lead-copy-max:900px}',
    '.hero p{font-size:20px;color:rgba(255,255,255,.82);max-width:var(--hero-copy-max)}',
    '.lead{font-size:18px;color:var(--muted);max-width:var(--lead-copy-max)}',
    '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
    '.steps{display:grid;grid-template-columns:repeat(4,1fr)',
    '.cta{background:linear-gradient(135deg,#111827,#020617)',
    '@media(max-width:900px){.grid,.grid2,.steps,.cta{grid-template-columns:1fr}',
):
    if marker not in css:
        raise SystemExit(f'Missing CSS contract marker: {marker}')

for page_name, expected in PAGES.items():
    html = (ROOT / page_name).read_text(encoding='utf-8')

    if '<style' in html.lower() or '</style>' in html.lower():
        raise SystemExit(f'{page_name}: inline style block returned')
    executable_inline = re.search(
        r'<script(?![^>]*\bsrc=)(?![^>]*type=["\']application/ld\+json["\'])[^>]*>',
        html,
        flags=re.I,
    )
    if executable_inline:
        raise SystemExit(f'{page_name}: executable inline script is not allowed')

    shared_css = 'assets/public-business-segment.css?v=1'
    for marker in (expected['form_css'], shared_css, expected['form_js']):
        if html.count(marker) != 1:
            raise SystemExit(f'{page_name}: expected exactly one {marker}')
    if html.index(expected['form_css']) > html.index(shared_css):
        raise SystemExit(f'{page_name}: shared CSS must load after form CSS')

    if f'<body class="{expected["body_class"]}">' not in html:
        raise SystemExit(f'{page_name}: missing page body class')
    if f'<link rel="canonical" href="{expected["canonical"]}">' not in html:
        raise SystemExit(f'{page_name}: canonical mismatch')
    if f'<h1>{expected["h1"]}</h1>' not in html:
        raise SystemExit(f'{page_name}: H1 changed')
    if f'<h2>{expected["cta"]}</h2>' not in html:
        raise SystemExit(f'{page_name}: CTA heading changed')
    card_count = html.count('class="card"')
    if card_count != expected['cards']:
        raise SystemExit(f'{page_name}: expected {expected["cards"]} cards, found {card_count}')
    if html.count('class="step"') != 4:
        raise SystemExit(f'{page_name}: expected four process steps')
    if html.count('id="leader-lead-form"') != 1:
        raise SystemExit(f'{page_name}: lead form container mismatch')
    if 'href="tel:+79802457471"' not in html:
        raise SystemExit(f'{page_name}: phone link missing')
    if '"@type":"Service"' not in html:
        raise SystemExit(f'{page_name}: Service JSON-LD missing')

print('Shared business segment CSS contract is valid for four pages and 62 cards.')
