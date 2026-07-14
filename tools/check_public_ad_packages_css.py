#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'komplekty-reklamy.html'
CSS = ROOT / 'assets' / 'public-ad-packages.css'


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def forbid(text: str, marker: str, source: Path) -> None:
    if marker in text:
        raise SystemExit(f'Forbidden {marker!r} in {source.relative_to(ROOT)}')


def main() -> None:
    html = PAGE.read_text(encoding='utf-8')
    css = CSS.read_text(encoding='utf-8')

    for marker in (
        '<link rel="stylesheet" href="assets/public-lead-form.css?v=12">',
        '<link rel="stylesheet" href="assets/public-ad-packages.css?v=1">',
        '<script src="assets/public-lead-form.js?v=12"></script>',
        '<link rel="canonical" href="https://www.lider-bsk.ru/komplekty-reklamy.html">',
        '<meta name="robots" content="index, follow">',
        '"@type":"ItemList"',
        '"position":6',
        '<div id="leader-lead-form"></div>',
        'Почему цена считается индивидуально',
        'Рассчитать комплект рекламы',
    ):
        require(html, marker, PAGE)

    if html.index('public-lead-form.css?v=12') > html.index('public-ad-packages.css?v=1'):
        raise SystemExit('Page CSS must load after the shared lead-form CSS')

    forbid(html, '<style>', PAGE)
    forbid(html, '</style>', PAGE)

    package_titles = (
        'Комплект для магазина',
        'Комплект для кафе',
        'Комплект для салона или мастера',
        'Комплект для сервиса',
        'Комплект для пункта выдачи или офиса',
        'Онлайн-комплект',
    )
    for title in package_titles:
        require(html, title, PAGE)

    if html.count('<article class="card">') + html.count('<article class="card"><div class="label">') != 6:
        raise SystemExit('Expected exactly six advertising package cards')
    if html.count('<div class="level">') != 18:
        raise SystemExit('Expected three package levels for each of six packages')
    if html.count('<div class="step">') != 4:
        raise SystemExit('Expected exactly four package selection steps')

    if len(css.strip()) < 2500:
        raise SystemExit('Advertising packages stylesheet is unexpectedly small')
    for marker in (
        ':root{',
        '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
        '.levels{display:grid',
        '.label{position:absolute',
        '.cta{background:linear-gradient',
        '@media(max-width:940px)',
    ):
        require(css, marker, CSS)

    if re.search(r'<script(?![^>]*type=["\']application/ld\+json["\'])[^>]*>\s*[^<\s]', html, re.I):
        raise SystemExit('Unexpected executable inline JavaScript on packages page')

    print('Public advertising packages CSS contract is valid.')


if __name__ == '__main__':
    main()
