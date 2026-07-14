#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'reklama-v-soobshchestvah-borisoglebska.html'
CSS = ROOT / 'assets' / 'public-community-ads.css'
JS = ROOT / 'assets' / 'public-community-ads.js'


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def main() -> None:
    html = PAGE.read_text(encoding='utf-8')
    css = CSS.read_text(encoding='utf-8')
    js = JS.read_text(encoding='utf-8')

    for marker in (
        '<link rel="stylesheet" href="assets/public-lead-form.css?v=26">',
        '<link rel="stylesheet" href="assets/public-community-ads.css?v=1">',
        '<script src="assets/public-lead-form.js?v=26"></script>',
        '<script src="assets/public-community-ads.js?v=1"></script>',
        '<link rel="canonical" href="https://www.lider-bsk.ru/reklama-v-soobshchestvah-borisoglebska.html">',
        '<meta name="robots" content="index, follow">',
        'id="packages"',
        'id="communities"',
        '<div id="leader-lead-form"></div>',
        'Рассчитать рекламу в сообществах',
        'Не включены площадки из исходного списка',
    ):
        require(html, marker, PAGE)

    if html.index('public-lead-form.css?v=26') > html.index('public-community-ads.css?v=1'):
        raise SystemExit('Page CSS must load after shared form CSS')
    if html.index('public-lead-form.js?v=26') > html.index('public-community-ads.js?v=1'):
        raise SystemExit('Page preset must load after shared form JS')
    if '<style>' in html or '</style>' in html:
        raise SystemExit('Inline style block remains on community ads page')
    if re.search(r'<script(?![^>]*type=["\']application/ld\+json["\'])[^>]*>\s*[^<\s]', html, re.I):
        raise SystemExit('Executable inline JavaScript remains on community ads page')

    if html.count('<script type="application/ld+json">') != 2:
        raise SystemExit('Expected exactly two JSON-LD blocks')
    if html.count('<details') != 6:
        raise SystemExit('Expected exactly six visible FAQ items')
    if html.count('<div class="step">') != 4:
        raise SystemExit('Expected exactly four request preparation steps')
    if html.count('<tr>') < 20:
        raise SystemExit('Community table has unexpectedly few rows')
    if html.count('target="_blank"') != html.count('rel="noopener"'):
        raise SystemExit('Every new-tab community link must include rel="noopener"')

    if len(css.strip()) < 3000:
        raise SystemExit('Community advertising stylesheet is unexpectedly small')
    for marker in (
        '.table-wrap{overflow:auto',
        'table{width:100%',
        '.faq{display:grid',
        '.steps{display:grid',
        '@media(max-width:900px)',
    ):
        require(css, marker, CSS)

    for marker in (
        "el.value='Соцсети и контент'",
        'Страница: реклама в сообществах Борисоглебска ВК/ОК.',
        'setTimeout',
        '700',
    ):
        require(js, marker, JS)

    print('Public community advertising assets contract is valid.')


if __name__ == '__main__':
    main()
