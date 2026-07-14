#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'reklama-v-socsetyah-borisoglebsk.html'
CSS = ROOT / 'assets' / 'public-social-ads.css'


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
        '<link rel="stylesheet" href="assets/public-lead-form.css?v=17">',
        '<link rel="stylesheet" href="assets/public-social-ads.css?v=1">',
        '<script src="assets/public-lead-form.js?v=17"></script>',
        '<script src="assets/mobile-sticky-cta.js?v=1"></script>',
        '<link rel="canonical" href="https://www.lider-bsk.ru/reklama-v-socsetyah-borisoglebsk.html">',
        '<meta name="robots" content="index, follow">',
        '"@type":"Service"',
        '<div id="leader-lead-form"></div>',
        'Рассчитать рекламу в соцсетях Борисоглебска',
    ):
        require(html, marker, PAGE)

    if html.index('public-lead-form.css?v=17') > html.index('public-social-ads.css?v=1'):
        raise SystemExit('Page CSS must load after the shared lead-form CSS')

    forbid(html, '<style>', PAGE)
    forbid(html, '</style>', PAGE)

    for marker in (
        'Магазины и торговые точки',
        'Кафе, доставка, общепит',
        'Цирки, выставки, ярмарки',
        'Салоны и специалисты',
        'Сервисы и ремонт',
        'Строительство и недвижимость',
        'Текст рекламного поста',
        'Изображение к посту',
        'Размещение в сообществах',
        'Повторные публикации',
        'Адрес, карта и контакты',
        'Комплект под запуск',
        'Один рекламный пост',
        'Серия публикаций',
        'Комплексная реклама',
        'Что рекламируем',
        'Дата и срок',
        'Материалы',
        'Цель',
    ):
        require(html, marker, PAGE)

    if html.count('<div class="step">') != 4:
        raise SystemExit('Expected exactly four request preparation steps')

    if len(css.strip()) < 2200:
        raise SystemExit('Social advertising stylesheet is unexpectedly small')
    for marker in (
        ':root{',
        '.hero-actions{display:flex',
        '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
        '.pill{display:inline-flex',
        '.warning{background:#eef6ff',
        '.cta{background:linear-gradient',
        '@media(max-width:900px)',
    ):
        require(css, marker, CSS)

    if re.search(r'<script(?![^>]*type=["\']application/ld\+json["\'])[^>]*>\s*[^<\s]', html, re.I):
        raise SystemExit('Unexpected executable inline JavaScript on social advertising page')

    print('Public social advertising CSS contract is valid.')


if __name__ == '__main__':
    main()
