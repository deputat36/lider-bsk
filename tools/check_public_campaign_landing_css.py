#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CSS_PATH = ROOT / 'assets' / 'public-campaign-landing.css'
FORM_CSS = 'assets/public-lead-form.css?v=4'
SHARED_CSS = 'assets/public-campaign-landing.css?v=1'

PAGES = {
    'reklamnye-posty-vk-borisoglebsk.html': {
        'body_class': 'page-vk-post',
        'canonical': 'https://www.lider-bsk.ru/reklamnye-posty-vk-borisoglebsk.html',
        'h1': 'Рекламные посты ВК в Борисоглебске',
        'headings': (
            'Для чего подходит',
            'Что входит',
            'Ориентиры по цене',
            'Рассчитать рекламный пост',
        ),
        'data_service': 'Соцсети и контент',
        'price_cards': 3,
        'form_js': 'assets/public-lead-form.js?v=5',
    },
    'reklama-otkrytiya-magazina-borisoglebsk.html': {
        'body_class': 'page-store-opening',
        'canonical': 'https://www.lider-bsk.ru/reklama-otkrytiya-magazina-borisoglebsk.html',
        'h1': 'Реклама открытия магазина в Борисоглебске',
        'headings': (
            'Что можно заказать',
            'Что входит в запуск',
            'Что прислать для расчёта',
            'Рассчитать рекламу открытия',
        ),
        'data_service': 'Комплексная реклама',
        'price_cards': 0,
        'form_js': 'assets/public-lead-form.js?v=28',
    },
}

css = CSS_PATH.read_text(encoding='utf-8')
if len(css) < 1800:
    raise SystemExit(f'Campaign landing CSS is unexpectedly small: {len(css)} bytes')

for marker in (
    'body.page-vk-post,body.page-store-opening',
    '.top .container,.header .container,.footer .container',
    '.hero-grid,.cta{display:grid;grid-template-columns:1fr 1fr',
    '.grid3{display:grid;grid-template-columns:repeat(3,1fr)',
    '.card p,.card li{color:#667085}',
    '@media(max-width:900px){.hero-grid,.grid3,.cta{grid-template-columns:1fr}.nav{display:none}}',
):
    if marker not in css:
        raise SystemExit(f'Missing CSS contract marker: {marker}')

for page_name, expected in PAGES.items():
    html = (ROOT / page_name).read_text(encoding='utf-8')

    if '<style' in html.lower() or '</style>' in html.lower():
        raise SystemExit(f'{page_name}: inline style block returned')
    if re.search(
        r'<script(?![^>]*\bsrc=)(?![^>]*\btype=["\']application/ld\+json["\'])[^>]*>',
        html,
        flags=re.I,
    ):
        raise SystemExit(f'{page_name}: executable inline script is not allowed')

    for marker in (FORM_CSS, SHARED_CSS, expected['form_js']):
        if html.count(marker) != 1:
            raise SystemExit(f'{page_name}: expected exactly one {marker}')
    if html.index(FORM_CSS) > html.index(SHARED_CSS):
        raise SystemExit(f'{page_name}: shared CSS must load after form CSS')

    if f'<body class="{expected["body_class"]}">' not in html:
        raise SystemExit(f'{page_name}: missing page body class')
    if f'<link rel="canonical" href="{expected["canonical"]}">' not in html:
        raise SystemExit(f'{page_name}: canonical mismatch')
    if f'<h1>{expected["h1"]}</h1>' not in html:
        raise SystemExit(f'{page_name}: H1 changed')
    for heading in expected['headings']:
        if f'<h2>{heading}</h2>' not in html:
            raise SystemExit(f'{page_name}: heading changed or missing: {heading}')

    if html.count('<article class="card">') != 6:
        raise SystemExit(f'{page_name}: expected six campaign cards')
    if html.count('class="container hero-grid"') != 1:
        raise SystemExit(f'{page_name}: hero grid mismatch')
    if html.count('class="container cta"') != 1:
        raise SystemExit(f'{page_name}: CTA grid mismatch')
    if html.count('id="leader-lead-form"') != 1:
        raise SystemExit(f'{page_name}: lead form container mismatch')
    if html.count('data-leader-lead-form') != 1:
        raise SystemExit(f'{page_name}: lead form marker mismatch')
    if f'data-service="{expected["data_service"]}"' not in html:
        raise SystemExit(f'{page_name}: service preset changed')
    if html.count('class="price"') != expected['price_cards']:
        raise SystemExit(f'{page_name}: price card count changed')
    if 'href="tel:+79802457471"' not in html:
        raise SystemExit(f'{page_name}: phone link missing')
    if 'href="privacy.html"' not in html:
        raise SystemExit(f'{page_name}: privacy link missing')

print('Campaign landing shared CSS contract is valid for two pages.')
