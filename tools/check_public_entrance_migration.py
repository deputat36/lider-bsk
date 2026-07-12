#!/usr/bin/env python3
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'oformlenie-vhoda-borisoglebsk.html'
SHARED_CSS = ROOT / 'assets' / 'public-landing.css'
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
    form_script = FORM_SCRIPT.read_text(encoding='utf-8')
    parser = PageParser()
    parser.feed(text)

    for marker in (
        '<title>Оформление входа в Борисоглебске — вывески, таблички, режим работы, витрины | РА Лидер</title>',
        '<meta name="description" content="Оформление входной группы',
        '<link rel="canonical" href="https://www.lider-bsk.ru/oformlenie-vhoda-borisoglebsk.html">',
        '<script type="application/ld+json">',
        '"@type":"Service"',
        'id="leader-lead-form" data-leader-lead-form',
        'data-service="Вывеска / наружная реклама"',
        'assets/public-lead-form.js?v=5',
        'номер обращения — его можно использовать для быстрой проверки',
        'privacy.html',
    ):
        require(text, marker)

    if parser.stylesheets[:2] != [
        'assets/public-landing.css?v=1',
        'assets/public-lead-form.css?v=4',
    ]:
        raise SystemExit(f'Unexpected stylesheet order: {parser.stylesheets[:2]}')

    for marker in (
        'assets/public-lead-form.js?v=4',
        ':root{--black:#1a1a1a',
        '*{box-sizing:border-box}',
        'body{margin:0;font-family:Montserrat',
        'найдёт вашу заявку в CRM',
    ):
        forbid(text, marker)

    inline_size = sum(len(style.strip()) for style in parser.inline_styles)
    if inline_size > 4500:
        raise SystemExit(f'Inline CSS remains too large: {inline_size} characters')

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

    require(
        form_script,
        "'oformlenie-vhoda-borisoglebsk.html':{service:'Вывеска / наружная реклама'",
        'assets/public-lead-form.js',
    )

    for href in parser.hrefs:
        path = urlsplit(href).path
        if not path.endswith('.html') or href.startswith(('http://', 'https://')):
            continue
        if not (ROOT / path).is_file():
            raise SystemExit(f'Broken local link: {href}')

    print('Entrance shared CSS migration contract is valid.')


if __name__ == '__main__':
    main()
