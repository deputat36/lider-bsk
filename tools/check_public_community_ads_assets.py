#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'reklama-v-soobshchestvah-borisoglebska.html'
CSS = ROOT / 'assets' / 'public-community-ads.css'


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def main() -> None:
    html = PAGE.read_text(encoding='utf-8')
    css = CSS.read_text(encoding='utf-8')

    for marker in (
        '<link rel="stylesheet" href="assets/public-lead-form.css?v=30">',
        '<link rel="stylesheet" href="assets/public-community-ads.css?v=2">',
        '<script src="assets/public-lead-form.js?v=36"></script>',
        '<link rel="canonical" href="https://www.lider-bsk.ru/reklama-v-soobshchestvah-borisoglebska.html">',
        '<meta name="robots" content="index, follow">',
        'id="packages"',
        'id="communities"',
        '<div id="leader-lead-form"></div>',
        'Рассчитать рекламу в сообществах',
    ):
        require(html, marker, PAGE)

    if html.index('public-lead-form.css?v=30') > html.index('public-community-ads.css?v=2'):
        raise SystemExit('Page CSS must load after shared form CSS')
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
    if any(marker in html for marker in ('предоставленной выгрузке', 'актуальному списку из файла', 'Не включены площадки из исходного списка')):
        raise SystemExit('Internal import notes must stay out of customer copy')
    if '<th>Подписчики</th>' in html or 'class="aud"' in html:
        raise SystemExit('Undated historical audience counts must not look current')
    table = re.search(r'<table>.*?</table>', html, re.S).group()
    for row in re.findall(r'<tr>.*?</tr>', table, re.S):
        if len(re.findall(r'<t[hd]\b', row)) != 4:
            raise SystemExit('Each community row must keep four complete cells')
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

    if 'public-community-ads.js' in html:
        raise SystemExit('Obsolete delayed preset must not override the shared form')

    print('Public community advertising assets contract is valid.')


if __name__ == '__main__':
    main()
