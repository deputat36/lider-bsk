#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'uslugi.html'


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []
        self.ids: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if values.get('id'):
            self.ids.add(values['id'] or '')
        if tag == 'a' and values.get('href'):
            self.hrefs.append(values['href'] or '')


def require(text: str, marker: str) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in uslugi.html')


def forbid(text: str, marker: str) -> None:
    if marker in text:
        raise SystemExit(f'Forbidden legacy marker {marker!r} in uslugi.html')


def main() -> None:
    text = PAGE.read_text(encoding='utf-8')
    parser = LinkParser()
    parser.feed(text)

    for marker in (
        '<title>Услуги РА Лидер в Борисоглебске</title>',
        '<link rel="canonical" href="https://www.lider-bsk.ru/uslugi.html">',
        '<meta property="og:url" content="https://www.lider-bsk.ru/uslugi.html">',
        'Каталог рекламных услуг в Борисоглебске',
        'Наружная реклама и оформление точки',
        'Печать и полиграфия',
        'Дизайн и фирменный стиль',
        'Продвижение и онлайн-оформление',
        'Не нашли точное название услуги?',
        'data-leader-lead-form',
        'assets/public-lead-form.js?v=23',
        '"@type":"CollectionPage"',
        '"@type":"ItemList"',
        'privacy.html',
    ):
        require(text, marker)

    for section_id in ('outdoor', 'print', 'design', 'online', 'request'):
        if section_id not in parser.ids:
            raise SystemExit(f'Missing section id: {section_id}')

    for marker in (
        '<style>body{margin:0',
        '<div class="grid">',
        '<article class="card"><h2>Наружная реклама</h2>',
        '<script src="assets/public-related-services.js',
    ):
        forbid(text, marker)

    local_html = []
    for href in parser.hrefs:
        path = urlsplit(href).path
        if path.endswith('.html') and not href.startswith(('http://', 'https://')):
            local_html.append(path)
            if not (ROOT / path).is_file():
                raise SystemExit(f'Broken local service link: {href}')

    if len(set(local_html)) < 30:
        raise SystemExit(f'Expected at least 30 unique local HTML links, found {len(set(local_html))}')

    print('Public services catalog contract is valid.')


if __name__ == '__main__':
    main()
