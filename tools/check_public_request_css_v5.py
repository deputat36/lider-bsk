#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'request.html'
CSS = ROOT / 'assets' / 'public-request.css'


class Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stylesheets: list[str] = []
        self.scripts: list[str] = []
        self.ids: set[str] = set()
        self.style_count = 0
        self.h1_count = 0
        self.form_mount_count = 0
        self.scenarios: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get('id'):
            self.ids.add(values['id'] or '')
        if tag == 'link' and values.get('rel') == 'stylesheet' and values.get('href'):
            self.stylesheets.append(values['href'] or '')
        if tag == 'script' and values.get('src'):
            self.scripts.append(values['src'] or '')
        if tag == 'style':
            self.style_count += 1
        if tag == 'h1':
            self.h1_count += 1
        if values.get('id') == 'leader-lead-form' or 'data-leader-lead-form' in values:
            self.form_mount_count += 1
        if values.get('data-scenario'):
            self.scenarios.add(values['data-scenario'] or '')


def require(text: str, marker: str, source: str) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source}')


def main() -> None:
    page = PAGE.read_text(encoding='utf-8')
    css = CSS.read_text(encoding='utf-8') if CSS.exists() else ''
    parser = Parser()
    parser.feed(page)

    for marker in (
        '<title>Оставить заявку — РА Лидер</title>',
        '<meta name="description" content="Оставьте заявку',
        'После отправки вы получите номер обращения для быстрой проверки.',
        '<link rel="canonical" href="https://www.lider-bsk.ru/request.html">',
        '<meta property="og:url" content="https://www.lider-bsk.ru/request.html">',
        'data-request-page-version="20260628-clarity-2"',
        'Номер обращения после отправки',
        'Что будет дальше',
        'Выберите похожую задачу',
        'Перед отправкой',
        'После отправки',
        'Номер обращения',
    ):
        require(page, marker, 'request.html')

    for marker in (
        'Заявка попадет в CRM',
        'Заявка сразу попадёт в CRM',
        'assets/public-lead-form.js?v=4',
        'assets/public-lead-form.js?v=5',
        '<style>',
        '</style>',
    ):
        if marker in page:
            raise SystemExit(f'Stale request marker remains: {marker}')

    expected_stylesheets = [
        'assets/public-lead-form.css?v=4',
        'assets/public-request.css?v=1',
    ]
    if parser.stylesheets != expected_stylesheets:
        raise SystemExit(f'Unexpected request stylesheets: {parser.stylesheets}')
    if parser.style_count != 0:
        raise SystemExit(f'Request page must not contain inline style blocks, found {parser.style_count}')

    expected_scripts = [
        'assets/public-lead-reference-v1.js?v=1',
        'assets/public-lead-form.js?v=23',
    ]
    if parser.scripts != expected_scripts:
        raise SystemExit(f'Unexpected request script order: {parser.scripts}')

    required_ids = {'request-title', 'next-title', 'leader-lead-form', 'scenarios', 'before-submit', 'after-title'}
    missing_ids = required_ids - parser.ids
    if missing_ids:
        raise SystemExit('Missing request IDs: ' + ', '.join(sorted(missing_ids)))
    if parser.h1_count != 1:
        raise SystemExit(f'Request page must contain exactly one h1, found {parser.h1_count}')
    if parser.form_mount_count != 1:
        raise SystemExit(f'Request page must contain exactly one form mount, found {parser.form_mount_count}')

    required_scenarios = {'shop', 'cafe', 'service', 'beauty', 'construction', 'office'}
    if parser.scenarios != required_scenarios:
        raise SystemExit(f'Unexpected request scenarios: {sorted(parser.scenarios)}')

    # The extracted source is 5536 characters. Keep a small truncation guard while
    # validating the important selectors and responsive breakpoints independently.
    if len(css) < 5200:
        raise SystemExit(f'Request CSS looks incomplete: {len(css)} characters')
    for marker in (
        'Extracted without visual changes',
        ':root{--black:#1a1a1a',
        '.header__inner{min-height:76px',
        '.hero__grid{display:grid',
        '.scenario-grid{display:grid',
        '.info-grid{display:grid',
        '.after-submit{background:#fff}',
        '@media(max-width:900px)',
        '@media(max-width:560px)',
    ):
        require(css, marker, 'assets/public-request.css')

    print('Request page CSS, source copy and form v23 contract is valid.')


if __name__ == '__main__':
    main()
