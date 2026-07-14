#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / 'assets' / 'public-simple-service.css'
PAGES = {
    'socseti-kontent.html': {
        'body_class': 'page-social-content',
        'shared_css': 'assets/public-simple-service.css?v=1',
        'canonical': 'https://www.lider-bsk.ru/socseti-kontent.html',
        'h1': 'Оформление и ведение соцсетей для бизнеса',
        'section': 'Что входит в работу',
        'cta': 'Заявка на соцсети',
    },
    'dizayn-maketov.html': {
        'body_class': 'page-design-service',
        'shared_css': 'assets/public-simple-service.css?v=1',
        'canonical': 'https://www.lider-bsk.ru/dizayn-maketov.html',
        'h1': 'Дизайн макетов для рекламы',
        'section': 'Какие макеты можно заказать',
        'cta': 'Заявка на дизайн',
    },
    'logotip-firmennyy-stil.html': {
        'body_class': 'page-brand-identity',
        'shared_css': 'assets/public-simple-service.css?v=1',
        'canonical': 'https://www.lider-bsk.ru/logotip-firmennyy-stil.html',
        'h1': 'Логотип и фирменный стиль',
        'section': 'Что можно заказать',
        'cta': 'Заявка на логотип или стиль',
    },
    'yandex-karty-2gis.html': {
        'body_class': 'page-maps-listing',
        'shared_css': 'assets/public-simple-service.css?v=1',
        'canonical': 'https://www.lider-bsk.ru/yandex-karty-2gis.html',
        'h1': 'Оформление карточки в Яндекс Картах и 2ГИС',
        'section': 'Что можно сделать',
        'cta': 'Заявка на оформление карточки',
    },
    'bannery-borisoglebsk.html': {
        'body_class': 'page-banner-service',
        'shared_css': 'assets/public-simple-service.css?v=2',
        'canonical': 'https://www.lider-bsk.ru/bannery-borisoglebsk.html',
        'h1': 'Баннеры в Борисоглебске',
        'section': 'Какие баннеры можно заказать',
        'cta': 'Заявка на баннер',
    },
    'tablichki-borisoglebsk.html': {
        'body_class': 'page-signage-service',
        'shared_css': 'assets/public-simple-service.css?v=2',
        'canonical': 'https://www.lider-bsk.ru/tablichki-borisoglebsk.html',
        'h1': 'Таблички в Борисоглебске',
        'section': 'Какие таблички можно заказать',
        'cta': 'Заявка на табличку',
    },
    'vyveski-borisoglebsk.html': {
        'body_class': 'page-shop-sign-service',
        'shared_css': 'assets/public-simple-service.css?v=2',
        'canonical': 'https://www.lider-bsk.ru/vyveski-borisoglebsk.html',
        'h1': 'Вывески в Борисоглебске',
        'section': 'Какие задачи решает вывеска',
        'cta': 'Заявка на вывеску',
    },
    'pechat-na-plenke-borisoglebsk.html': {
        'body_class': 'page-film-print-service',
        'shared_css': 'assets/public-simple-service.css?v=2',
        'canonical': 'https://www.lider-bsk.ru/pechat-na-plenke-borisoglebsk.html',
        'h1': 'Печать на плёнке в Борисоглебске',
        'section': 'Что можно заказать',
        'cta': 'Заявка на печать',
    },
    'oformlenie-vitrin-borisoglebsk.html': {
        'body_class': 'page-window-branding',
        'shared_css': 'assets/public-simple-service.css?v=2',
        'canonical': 'https://www.lider-bsk.ru/oformlenie-vitrin-borisoglebsk.html',
        'h1': 'Оформление витрин в Борисоглебске',
        'section': 'Что можно разместить на витрине',
        'cta': 'Заявка на оформление витрины',
    },
    'outdoor-advertising-borisoglebsk.html': {
        'body_class': 'page-outdoor-overview',
        'shared_css': 'assets/public-simple-service.css?v=3',
        'canonical': 'https://www.lider-bsk.ru/outdoor-advertising-borisoglebsk.html',
        'h1': 'Наружная реклама в Борисоглебске',
        'section': 'Что можно заказать',
        'cta': 'Оставьте заявку',
    },
    'nakleyki-plotternaya-rezka-borisoglebsk.html': {
        'body_class': 'page-plotter-stickers',
        'shared_css': 'assets/public-simple-service.css?v=3',
        'canonical': 'https://www.lider-bsk.ru/nakleyki-plotternaya-rezka-borisoglebsk.html',
        'h1': 'Наклейки и плоттерная резка в Борисоглебске',
        'section': 'Что можно сделать',
        'cta': 'Заявка на наклейки',
    },
}

css = CSS.read_text(encoding='utf-8')
if len(css) < 1950:
    raise SystemExit(f'Shared simple service CSS is unexpectedly small: {len(css)} bytes')

for marker in (
    'body.page-social-content{--hero-start:#0b1020;--hero-end:#1f2937}',
    'body.page-design-service{--hero-start:#080b14;--hero-end:#111827}',
    'body.page-brand-identity{--hero-start:#080b14;--hero-end:#111827}',
    'body.page-maps-listing{--hero-start:#0b1020;--hero-end:#1f2937}',
    'body.page-banner-service{--hero-start:#0b1020;--hero-end:#1f2937}',
    'body.page-signage-service{--hero-start:#0b1020;--hero-end:#1f2937}',
    'body.page-shop-sign-service{--hero-start:#080b14;--hero-end:#111827}',
    'body.page-film-print-service{--hero-start:#080b14;--hero-end:#111827}',
    'body.page-window-branding{--hero-start:#080b14;--hero-end:#111827}',
    'body.page-outdoor-overview{--hero-start:#080b14;--hero-end:#111827}',
    'body.page-plotter-stickers{--hero-start:#07111f;--hero-end:#111827}',
    'body.page-outdoor-overview .hero p{max-width:860px}',
    'body.page-outdoor-overview .back{color:#667085}',
    '.hero{background:linear-gradient(135deg,var(--hero-start),var(--hero-end))',
    '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
    '.cta{background:#111827;color:#fff',
    '@media(max-width:860px){.grid,.cta{grid-template-columns:1fr}}',
):
    if marker not in css:
        raise SystemExit(f'Missing CSS contract marker: {marker}')

for page_name, expected in PAGES.items():
    page = ROOT / page_name
    html = page.read_text(encoding='utf-8')

    if '<style' in html.lower() or '</style>' in html.lower():
        raise SystemExit(f'{page_name}: inline style block returned')
    if re.search(
        r'<script(?![^>]*\bsrc=)(?![^>]*\btype=["\']application/ld\+json["\'])[^>]*>',
        html,
        flags=re.I,
    ):
        raise SystemExit(f'{page_name}: executable inline script is not allowed')

    form_css = 'assets/public-lead-form.css?v=4'
    shared_css = expected['shared_css']
    form_js = 'assets/public-lead-form.js?v=5'
    for marker in (form_css, shared_css, form_js):
        if html.count(marker) != 1:
            raise SystemExit(f'{page_name}: expected exactly one {marker}')
    if html.index(form_css) > html.index(shared_css):
        raise SystemExit(f'{page_name}: shared CSS must load after form CSS')

    if f'<body class="{expected["body_class"]}">' not in html:
        raise SystemExit(f'{page_name}: missing page body class')
    if f'<link rel="canonical" href="{expected["canonical"]}">' not in html:
        raise SystemExit(f'{page_name}: canonical mismatch')
    if f'<h1>{expected["h1"]}</h1>' not in html:
        raise SystemExit(f'{page_name}: H1 changed')
    if f'<h2>{expected["section"]}</h2>' not in html:
        raise SystemExit(f'{page_name}: main section heading changed')
    if f'<h2>{expected["cta"]}</h2>' not in html:
        raise SystemExit(f'{page_name}: CTA heading changed')
    if html.count('class="card"') != 6:
        raise SystemExit(f'{page_name}: expected six service cards')
    if html.count('id="leader-lead-form"') != 1:
        raise SystemExit(f'{page_name}: lead form container mismatch')
    if 'href="tel:+79802457471"' not in html:
        raise SystemExit(f'{page_name}: phone link missing')

print('Shared simple service CSS contract is valid for eleven pages.')
