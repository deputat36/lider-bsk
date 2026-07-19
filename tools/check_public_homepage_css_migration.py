#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'index.html'
CSS = ROOT / 'assets' / 'public-homepage.css'


class Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []
        self.style_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == 'link' and values.get('rel') == 'stylesheet' and values.get('href'):
            self.stylesheets.append(values['href'] or '')
        if tag == 'script' and values.get('src'):
            self.scripts.append(values['src'] or '')
        if tag == 'style':
            self.style_count += 1


def require(text: str, marker: str, source: str) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source}')


def main() -> None:
    page = PAGE.read_text(encoding='utf-8')
    css = CSS.read_text(encoding='utf-8') if CSS.exists() else ''
    parser = Parser()
    parser.feed(page)

    # Form CSS must stay before homepage CSS so page-specific rules can refine
    # the shell without changing the public lead form contract.
    expected_stylesheets = [
        'assets/public-lead-form.css?v=4',
        'assets/public-homepage.css?v=1',
    ]
    if parser.stylesheets != expected_stylesheets:
        raise SystemExit(f'Unexpected homepage stylesheet order: {parser.stylesheets}')
    if parser.style_count != 0:
        raise SystemExit(f'Homepage must not contain inline style blocks, found {parser.style_count}')

    expected_scripts = [
        'assets/public-lead-form.js?v=23',
        'assets/packages-link.js?v=1',
    ]
    if parser.scripts != expected_scripts:
        raise SystemExit(f'Unexpected homepage script order: {parser.scripts}')

    if len(css) < 12000:
        raise SystemExit(f'Homepage design CSS looks incomplete: {len(css)} characters')

    # Design-system v2 foundations and all layout-critical surfaces.
    for marker in (
        'публичная главная страница, дизайн v2',
        '--orange:#ff6a00',
        '--black-deep:#090a0c',
        '--radius-lg:38px',
        '.mark{position:relative',
        '.header{',
        '.hero{',
        '.hero__facts{display:grid',
        '.hero-card{',
        '.grid3{display:grid',
        '.strip{display:grid',
        '.packages{display:grid',
        '.steps{display:grid',
        '.cta{',
        '.faq{display:grid',
        '.contacts{display:grid',
        '.mobile-cta{display:none',
        '@media(max-width:1100px)',
        '@media(max-width:720px)',
        '@media(prefers-reduced-motion:reduce)',
    ):
        require(css, marker, 'assets/public-homepage.css')

    # Public lead form and source-copy contracts remain unchanged.
    for marker in (
        'assets/public-lead-form.css?v=3',
        'assets/public-lead-form.js?v=4',
        'assets/public-lead-form.js?v=5',
        '<style>',
        '</style>',
    ):
        if marker in page:
            raise SystemExit(f'Stale homepage migration marker remains: {marker}')

    print('Homepage design v2 and public form v23 contracts are valid.')


if __name__ == '__main__':
    main()
