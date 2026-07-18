#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'banner-dlya-magazina-borisoglebsk.html'
BASE_CSS = ROOT / 'assets' / 'public-landing.css'
DETAIL_CSS = ROOT / 'assets' / 'public-banner-detail.css'
FORM_SCRIPT = ROOT / 'assets' / 'public-lead-form.js'


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.stylesheets: list[str] = []
        self.inline_styles = 0
        self.executable_inline_scripts = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == 'a' and values.get('href'):
            self.hrefs.append(values['href'] or '')
        if tag == 'link' and values.get('rel') == 'stylesheet' and values.get('href'):
            self.stylesheets.append(values['href'] or '')
        if tag == 'style':
            self.inline_styles += 1
        if tag == 'script' and not values.get('src'):
            script_type = (values.get('type') or '').lower()
            if script_type != 'application/ld+json':
                self.executable_inline_scripts += 1


def require(text: str, marker: str, source: str = 'page') -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source}')


def forbid(text: str, marker: str, source: str = 'page') -> None:
    if marker in text:
        raise SystemExit(f'Forbidden {marker!r} in {source}')


def main() -> None:
    text = PAGE.read_text(encoding='utf-8')
    base_css = BASE_CSS.read_text(encoding='utf-8')
    detail_css = DETAIL_CSS.read_text(encoding='utf-8')
    form_script = FORM_SCRIPT.read_text(encoding='utf-8')
    parser = PageParser()
    parser.feed(text)

    for marker in (
        '<title>Баннер для магазина в Борисоглебске — акция, открытие, фасад | РА Лидер</title>',
        '<meta name="description" content="Баннер для магазина в Борисоглебске:',
        '<link rel="canonical" href="https://www.lider-bsk.ru/banner-dlya-magazina-borisoglebsk.html">',
        '<script type="application/ld+json">',
        '"@type":"Service"',
        'id="leader-lead-form" data-leader-lead-form',
        'data-service="Баннер"',
        'assets/public-lead-form.js?v=28',
        'privacy.html',
    ):
        require(text, marker)

    expected_stylesheets = [
        'assets/public-landing.css?v=1',
        'assets/public-lead-form.css?v=4',
        'assets/public-banner-detail.css?v=1',
    ]
    if parser.stylesheets[:3] != expected_stylesheets:
        raise SystemExit(f'Unexpected stylesheet order: {parser.stylesheets[:3]}')
    if parser.inline_styles:
        raise SystemExit('Inline CSS returned to banner-dlya-magazina-borisoglebsk.html')
    if parser.executable_inline_scripts:
        raise SystemExit('Executable inline JavaScript returned to banner-dlya-magazina-borisoglebsk.html')

    for marker in (
        'assets/public-lead-form.js?v=4',
        'function prefill()',
        "service.value='Баннер'",
        ':root{--black:#1a1a1a',
        '*{box-sizing:border-box}',
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
        require(base_css, marker, 'assets/public-landing.css')

    for marker in (
        '.top__in{min-height:42px',
        '.hero__grid{grid-template-columns:1.02fr .98fr',
        '.hero-card{background:rgba(255,255,255,.09)',
        '.links a{border:1px solid var(--leader-line)',
        '@media(max-width:560px){.top__in{justify-content:center',
    ):
        require(detail_css, marker, 'assets/public-banner-detail.css')

    require(
        form_script,
        "'banner-dlya-magazina-borisoglebsk.html':{service:'Баннер'",
        'assets/public-lead-form.js',
    )

    for href in parser.hrefs:
        path = urlsplit(href).path
        if not path.endswith('.html') or href.startswith(('http://', 'https://')):
            continue
        if not (ROOT / path).is_file():
            raise SystemExit(f'Broken local link: {href}')

    print('Store banner external CSS and shared preset contract is valid.')


if __name__ == '__main__':
    main()
