#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'rezhim-raboty-tablichki-borisoglebsk.html'
SHARED_CSS = ROOT / 'assets' / 'public-landing.css'
DETAIL_CSS = ROOT / 'assets' / 'public-entry-detail.css'
FORM_SCRIPT = ROOT / 'assets' / 'public-lead-form.js'


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.stylesheets: list[str] = []
        self.inline_styles: list[str] = []
        self._in_style = False
        self._style_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == 'a' and values.get('href'):
            self.hrefs.append(values['href'] or '')
        if tag == 'link' and values.get('rel') == 'stylesheet' and values.get('href'):
            self.stylesheets.append(values['href'] or '')
        if tag == 'style':
            self._in_style = True
            self._style_parts = []

    def handle_data(self, data: str) -> None:
        if self._in_style:
            self._style_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == 'style' and self._in_style:
            self.inline_styles.append(''.join(self._style_parts))
            self._in_style = False
            self._style_parts = []


def require(text: str, marker: str, source: str = 'page') -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source}')


def forbid(text: str, marker: str, source: str = 'page') -> None:
    if marker in text:
        raise SystemExit(f'Forbidden {marker!r} in {source}')


def main() -> None:
    text = PAGE.read_text(encoding='utf-8')
    shared = SHARED_CSS.read_text(encoding='utf-8')
    detail = DETAIL_CSS.read_text(encoding='utf-8')
    form_script = FORM_SCRIPT.read_text(encoding='utf-8')
    parser = PageParser()
    parser.feed(text)

    for marker in (
        '<title>Режим работы и таблички в Борисоглебске — наклейки на дверь, график, контакты | РА Лидер</title>',
        '<meta name="description" content="Изготовим режим работы, табличку на дверь',
        '<link rel="canonical" href="https://www.lider-bsk.ru/rezhim-raboty-tablichki-borisoglebsk.html">',
        '<body class="page-working-hours-detail">',
        '<script type="application/ld+json">',
        '"@type":"Service"',
        'id="leader-lead-form" data-leader-lead-form',
        'data-service="Табличка"',
        'assets/public-lead-form.js?v=28',
        'номер обращения — его можно использовать для быстрой проверки',
        'privacy.html',
        'Ориентиры по цене',
        'Что прислать для расчёта',
        'Частые вопросы',
    ):
        require(text, marker)

    expected_stylesheets = [
        'assets/public-landing.css?v=1',
        'assets/public-lead-form.css?v=4',
        'assets/public-entry-detail.css?v=1',
    ]
    if parser.stylesheets[:3] != expected_stylesheets:
        raise SystemExit(f'Unexpected stylesheet order: {parser.stylesheets[:3]}')

    if parser.inline_styles:
        raise SystemExit('Working hours page must not contain inline CSS')
    if re.search(
        r'<script(?![^>]*\bsrc=)(?![^>]*\btype=["\']application/ld\+json["\'])[^>]*>',
        text,
        flags=re.I,
    ):
        raise SystemExit('Working hours page must not contain executable inline JavaScript')

    for marker in (
        'assets/public-lead-form.js?v=4',
        ':root{--black:#1a1a1a',
        '*{box-sizing:border-box}',
        'body{margin:0;font-family:Montserrat',
        'найти заявку в CRM',
        'function prefill()',
    ):
        forbid(text, marker)

    for marker in (
        '--leader-black:#1a1a1a',
        '.container,.wrap',
        '.hero-grid,.hero__grid,.cta',
        '.grid3',
        '.grid2',
        '.card',
        '.price',
        '.footer',
    ):
        require(shared, marker, 'assets/public-landing.css')

    for marker in (
        'body.page-entrance-detail,body.page-window-stickers-detail,body.page-working-hours-detail{--entry-grid-columns:1.02fr .98fr;--entry-section-head-width:840px}',
        '.hero{padding:74px 0 58px}',
        '.hero__grid{position:relative;z-index:1;grid-template-columns:var(--entry-grid-columns)',
        '.section-head{max-width:var(--entry-section-head-width);margin-bottom:28px}',
        '.faq details{background:#fff;border:1px solid var(--leader-line)',
        '@media(max-width:920px){body.page-entrance-detail .steps{grid-template-columns:1fr}h1{letter-spacing:-1px}.header__in{min-height:66px}}',
    ):
        require(detail, marker, 'assets/public-entry-detail.css')

    require(
        form_script,
        "'rezhim-raboty-tablichki-borisoglebsk.html':{service:'Табличка'",
        'assets/public-lead-form.js',
    )

    for href in parser.hrefs:
        path = urlsplit(href).path
        if not path.endswith('.html') or href.startswith(('http://', 'https://')):
            continue
        if not (ROOT / path).is_file():
            raise SystemExit(f'Broken local link: {href}')

    print('Working hours external detail CSS contract is valid.')


if __name__ == '__main__':
    main()
