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

    expected_stylesheets = [
        'assets/public-homepage.css?v=1',
        'assets/public-lead-form.css?v=4',
    ]
    if parser.stylesheets != expected_stylesheets:
        raise SystemExit(f'Unexpected homepage stylesheet order: {parser.stylesheets}')
    if parser.style_count != 0:
        raise SystemExit(f'Homepage must not contain inline style blocks, found {parser.style_count}')

    expected_scripts = [
        'assets/public-lead-form.js?v=5',
        'assets/packages-link.js?v=1',
    ]
    if parser.scripts != expected_scripts:
        raise SystemExit(f'Unexpected homepage script order: {parser.scripts}')

    if len(css) < 8000:
        raise SystemExit(f'Homepage CSS looks incomplete: {len(css)} characters')

    for marker in (
        'Extracted from index.html without visual changes',
        ':root{--black:#1a1a1a',
        '.mark{position:relative',
        '.header__in{min-height:78px',
        '.hero__facts{display:grid',
        '.strip{display:grid',
        '.packages{display:grid',
        '.steps{display:grid',
        '.cta{position:relative',
        '.faq{display:grid',
        '.contacts{display:grid',
        '.mobile-cta',
        '@media(max-width:1024px)',
        '@media(max-width:640px)',
    ):
        require(css, marker, 'assets/public-homepage.css')

    for marker in (
        'assets/public-lead-form.css?v=3',
        'assets/public-lead-form.js?v=4',
        '<style>',
        '</style>',
    ):
        if marker in page:
            raise SystemExit(f'Stale homepage migration marker remains: {marker}')

    print('Homepage CSS extraction and form v5 contract is valid.')


if __name__ == '__main__':
    main()
