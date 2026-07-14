#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / 'assets' / 'public-print-product.css'
JS = ROOT / 'assets' / 'public-print-product.js'
PAGES = {
    'blanki-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/blanki-borisoglebsk.html',
        'h1': 'Бланки и документы',
        'cta': 'Рассчитать бланки',
        'message': 'Страница: бланки и фирменные документы. Нужно рассчитать бланк, фирменный лист, прайс, анкету, коммерческое предложение или другой документ. Нужно уточнить формат, содержание, тираж, срок и нужен ли дизайн.',
    },
    'buklety-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/buklety-borisoglebsk.html',
        'h1': 'Буклеты и брошюры',
        'cta': 'Рассчитать буклеты',
        'message': 'Страница: буклеты и брошюры. Нужно рассчитать буклет, брошюру, мини-каталог, меню или презентационный материал. Нужно уточнить формат, количество страниц, тираж, бумагу, срок и нужен ли дизайн.',
    },
    'gramoty-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/gramoty-borisoglebsk.html',
        'h1': 'Грамоты и сертификаты',
        'cta': 'Рассчитать грамоты',
        'message': 'Страница: грамоты, дипломы и сертификаты. Нужно рассчитать грамоты, дипломы, сертификаты или благодарственные письма. Нужно уточнить формат, количество, бумагу, список имён, номинации, срок и нужен ли дизайн.',
    },
    'menyu-dlya-kafe-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/menyu-dlya-kafe-borisoglebsk.html',
        'h1': 'Меню для кафе и бара',
        'cta': 'Рассчитать меню',
        'message': 'Страница: меню для кафе и бара. Нужно рассчитать дизайн и печать меню, вкладышей, акционных листов или материалов для общепита. Нужно уточнить формат, количество страниц, тираж, бумагу, ламинацию, срок и нужен ли дизайн.',
    },
    'otkrytki-priglasheniya-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/otkrytki-priglasheniya-borisoglebsk.html',
        'h1': 'Открытки и приглашения',
        'cta': 'Рассчитать открытки',
        'message': 'Страница: открытки и приглашения. Нужно рассчитать открытки, приглашения, подарочные сертификаты или карточки для мероприятия. Нужно уточнить формат, тираж, бумагу, текст, персонализацию, срок и нужен ли дизайн.',
    },
    'kalendari-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/kalendari-borisoglebsk.html',
        'h1': 'Календари',
        'cta': 'Рассчитать календари',
        'message': 'Страница: календари. Нужно рассчитать календарь, планер или настольный печатный материал. Нужно уточнить формат, тираж, бумагу, срок и нужен ли дизайн.',
    },
    'birki-etiketki-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/birki-etiketki-borisoglebsk.html',
        'h1': 'Бирки и этикетки',
        'cta': 'Рассчитать бирки',
        'message': 'Страница: бирки и этикетки. Нужно рассчитать бирки, этикетки, карточки товара или вкладыши. Нужно уточнить размер, тираж, материал, текст, срок и нужен ли дизайн.',
    },
    'papki-konverty-borisoglebsk.html': {
        'canonical': 'https://www.lider-bsk.ru/papki-konverty-borisoglebsk.html',
        'h1': 'Папки и конверты',
        'cta': 'Рассчитать папки',
        'message': 'Страница: папки и конверты. Нужно рассчитать фирменные папки, конверты, обложки или деловой комплект. Нужно уточнить формат, тираж, бумагу, срок и нужен ли дизайн.',
    },
}

css = CSS.read_text(encoding='utf-8')
js = JS.read_text(encoding='utf-8')
if len(css) < 600:
    raise SystemExit(f'Print product CSS is unexpectedly small: {len(css)} bytes')
if len(js) < 700:
    raise SystemExit(f'Print product JS is unexpectedly small: {len(js)} bytes')

for marker in (
    '.wrap{width:min(100% - 32px,1080px);margin:auto}',
    '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
    '.cta{background:#111827;color:#fff;border-radius:28px',
    '@media(max-width:900px){.grid,.cta{grid-template-columns:1fr}}',
):
    if marker not in css:
        raise SystemExit(f'Missing CSS contract marker: {marker}')

for marker in (
    "page.classList.contains('page-print-product')",
    "page.getAttribute('data-lead-service')||'Полиграфия'",
    "page.getAttribute('data-lead-message')||''",
    "document.querySelector('[data-leader-lead-widget]')",
    "service.add(new Option(serviceName,serviceName))",
    'setTimeout(applyPrintProductPreset,120)',
):
    if marker not in js:
        raise SystemExit(f'Missing JS contract marker: {marker}')
for forbidden in ('fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage'):
    if forbidden in js:
        raise SystemExit(f'Print product preset must not use {forbidden}')

for page_name, expected in PAGES.items():
    html = (ROOT / page_name).read_text(encoding='utf-8')
    if '<style' in html.lower() or '</style>' in html.lower():
        raise SystemExit(f'{page_name}: inline style block returned')
    if re.search(r'<script(?![^>]*\bsrc=)(?![^>]*type=["\']application/ld\+json["\'])[^>]*>', html, flags=re.I):
        raise SystemExit(f'{page_name}: executable inline script returned')

    form_css = 'assets/public-lead-form.css?v=4'
    shared_css = 'assets/public-print-product.css?v=1'
    form_js = 'assets/public-lead-form.js?v=5'
    related_js = 'assets/public-related-services.js?v=2'
    preset_js = 'assets/public-print-product.js?v=1'
    for marker in (form_css, shared_css, form_js, related_js, preset_js):
        if html.count(marker) != 1:
            raise SystemExit(f'{page_name}: expected exactly one {marker}')
    if html.index(form_css) > html.index(shared_css):
        raise SystemExit(f'{page_name}: shared CSS must load after form CSS')
    if not (html.index(form_js) < html.index(related_js) < html.index(preset_js)):
        raise SystemExit(f'{page_name}: script order must be form -> related services -> print preset')

    body_marker = (
        '<body class="page-print-product" data-lead-service="Полиграфия" '
        f'data-lead-message="{expected["message"]}">'
    )
    if body_marker not in html:
        raise SystemExit(f'{page_name}: body preset attributes mismatch')
    if f'<link rel="canonical" href="{expected["canonical"]}">' not in html:
        raise SystemExit(f'{page_name}: canonical mismatch')
    if f'<h1>{expected["h1"]}</h1>' not in html:
        raise SystemExit(f'{page_name}: H1 changed')
    if f'<h2>{expected["cta"]}</h2>' not in html:
        raise SystemExit(f'{page_name}: CTA heading changed')
    if html.count('class="card"') != 6:
        raise SystemExit(f'{page_name}: expected six cards')
    if html.count('id="leader-lead-form"') != 1:
        raise SystemExit(f'{page_name}: lead form container mismatch')
    if 'href="tel:+79802457471"' not in html:
        raise SystemExit(f'{page_name}: phone link missing')

print('Shared print product assets contract is valid for eight pages and 48 cards.')
