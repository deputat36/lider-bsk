#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import json
import re

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / 'primery-rabot-kejsy.html'
EXAMPLES_CSS = ROOT / 'assets' / 'public-examples.css'
FORM_SCRIPT = ROOT / 'assets' / 'public-lead-form.js'
LEGACY = ROOT / 'portfolio.html'
SITEMAP = ROOT / 'sitemap.xml'
OG_CONFIG = ROOT / 'tools' / 'open_graph_pages.json'
SCHEMA_CONFIG = ROOT / 'tools' / 'structured_data_pages.json'


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.stylesheets: list[str] = []
        self.inline_styles = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == 'a' and values.get('href'):
            self.hrefs.append(values['href'] or '')
        if tag == 'link' and values.get('rel') == 'stylesheet' and values.get('href'):
            self.stylesheets.append(values['href'] or '')
        if tag == 'style':
            self.inline_styles += 1


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def forbid(text: str, marker: str, source: Path) -> None:
    if marker in text:
        raise SystemExit(f'Forbidden {marker!r} in {source.relative_to(ROOT)}')


def main() -> None:
    examples = EXAMPLES.read_text(encoding='utf-8')
    examples_css = EXAMPLES_CSS.read_text(encoding='utf-8')
    form_script = FORM_SCRIPT.read_text(encoding='utf-8')
    legacy = LEGACY.read_text(encoding='utf-8')
    sitemap = SITEMAP.read_text(encoding='utf-8')
    og = json.loads(OG_CONFIG.read_text(encoding='utf-8'))
    schema = json.loads(SCHEMA_CONFIG.read_text(encoding='utf-8'))
    parser = PageParser()
    parser.feed(examples)

    for marker in (
        '<title>Примеры рекламных задач в Борисоглебске | РА Лидер</title>',
        '<meta name="robots" content="index, follow">',
        '<link rel="canonical" href="https://www.lider-bsk.ru/primery-rabot-kejsy.html">',
        '<body class="page-examples">',
        'Не вымышленные кейсы, а понятные сценарии заказа',
        'Они не выдаются за реальные работы или отзывы клиентов.',
        'Фотографии конкретных выполненных заказов публикуются только после отбора материалов и согласования с заказчиками.',
        'data-leader-lead-form',
        'assets/public-lead-form.js?v=22',
        'Получите номер',
    ):
        require(examples, marker, EXAMPLES)

    expected_stylesheets = [
        'assets/public-lead-form.css?v=22',
        'assets/public-examples.css?v=1',
    ]
    if parser.stylesheets != expected_stylesheets:
        raise SystemExit(f'Unexpected examples stylesheet order: {parser.stylesheets}')
    if parser.inline_styles:
        raise SystemExit('Inline CSS returned to primery-rabot-kejsy.html')
    if re.search(
        r'<script(?![^>]*\bsrc=)(?![^>]*\btype=["\']application/ld\+json["\'])[^>]*>',
        examples,
        flags=re.I,
    ):
        raise SystemExit('Executable inline JavaScript is not allowed on examples page')

    if examples.count('<article class="card">') != 6:
        raise SystemExit('Examples page must keep six task cards')
    if examples.count('<div class="step">') != 4:
        raise SystemExit('Examples page must keep four calculation steps')
    if examples.count('id="leader-lead-form"') != 1:
        raise SystemExit('Examples page lead form container mismatch')

    for marker in (
        'body.page-examples',
        '--shadow:0 18px 48px rgba(26,26,26,.10)',
        '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
        '.steps{display:grid;grid-template-columns:repeat(4,1fr)',
        '.cta{background:linear-gradient(135deg,#111417,#1a1a1a)',
        '@media(max-width:900px)',
        '.grid,.steps,.cta{grid-template-columns:1fr}',
    ):
        require(examples_css, marker, EXAMPLES_CSS)

    require(
        form_script,
        "'primery-rabot-kejsy.html':{service:'Комплексная реклама'",
        FORM_SCRIPT,
    )

    for marker in (
        'Место для фото',
        'Шаблон кейсов для будущего наполнения',
        'структура под реальные фото',
        'Какие работы можно показать клиентам',
        'Пока на странице можно постепенно добавлять реальные фотографии',
    ):
        forbid(examples, marker, EXAMPLES)

    for marker in (
        '<meta name="robots" content="noindex, follow">',
        '<link rel="canonical" href="https://www.lider-bsk.ru/primery-rabot-kejsy.html">',
        'url=primery-rabot-kejsy.html',
        "location.replace('primery-rabot-kejsy.html')",
    ):
        require(legacy, marker, LEGACY)

    require(sitemap, 'https://www.lider-bsk.ru/primery-rabot-kejsy.html', SITEMAP)
    forbid(sitemap, 'https://www.lider-bsk.ru/portfolio.html', SITEMAP)

    og_paths = {page['path'] for page in og['pages']}
    schema_paths = {page['path'] for page in schema['pages']}
    for paths, source in ((og_paths, OG_CONFIG), (schema_paths, SCHEMA_CONFIG)):
        if 'primery-rabot-kejsy.html' not in paths:
            raise SystemExit(f'Examples page missing from {source.relative_to(ROOT)}')
        if 'portfolio.html' in paths:
            raise SystemExit(f'Legacy portfolio remains in {source.relative_to(ROOT)}')

    for href in parser.hrefs:
        path = urlsplit(href).path
        if not path.endswith('.html') or href.startswith(('http://', 'https://')):
            continue
        if not (ROOT / path).is_file():
            raise SystemExit(f'Broken local examples link: {href}')

    print('Public examples consolidation and external CSS contract is valid.')


if __name__ == '__main__':
    main()
