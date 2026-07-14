#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'reklama-dlya-meropriyatiy-borisoglebsk.html'
CSS = ROOT / 'assets' / 'public-event-ads.css'


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
        '<link rel="stylesheet" href="assets/public-lead-form.css?v=16">',
        '<link rel="stylesheet" href="assets/public-event-ads.css?v=1">',
        '<script src="assets/public-lead-form.js?v=16"></script>',
        '<link rel="canonical" href="https://www.lider-bsk.ru/reklama-dlya-meropriyatiy-borisoglebsk.html">',
        '<meta name="robots" content="index, follow">',
        '"@type":"Service"',
        '<div id="leader-lead-form"></div>',
        'Рассчитать рекламу мероприятия',
    ):
        require(html, marker, PAGE)

    if html.index('public-lead-form.css?v=16') > html.index('public-event-ads.css?v=1'):
        raise SystemExit('Page CSS must load after the shared lead-form CSS')

    forbid(html, '<style>', PAGE)
    forbid(html, '</style>', PAGE)

    for marker in (
        'Цирки и шоу',
        'Выставки',
        'Фестивали и ярмарки',
        'Выездная торговля',
        'Концерты и выступления',
        'Переездной бизнес',
        'Размещение в местных соцсетях',
        'Макет афиши или поста',
        'Баннеры и наружная реклама',
        'Текст объявления',
        'Карты и ориентиры',
        'Комплект рекламы',
        'Быстрый запуск',
        'Усиленный запуск',
        'Информация о мероприятии',
        'Материалы для рекламы',
        'Заявка',
        'Упаковка',
        'Размещение',
        'Повтор',
    ):
        require(html, marker, PAGE)

    if html.count('<div class="step">') != 4:
        raise SystemExit('Expected exactly four event advertising workflow steps')

    if len(css.strip()) < 2000:
        raise SystemExit('Event advertising stylesheet is unexpectedly small')
    for marker in (
        ':root{',
        '.hero-actions{display:flex',
        '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
        '.grid2{display:grid;grid-template-columns:repeat(2,1fr)',
        '.pill{display:inline-flex',
        '.cta{background:linear-gradient',
        '@media(max-width:900px)',
    ):
        require(css, marker, CSS)

    if re.search(r'<script(?![^>]*type=["\']application/ld\+json["\'])[^>]*>\s*[^<\s]', html, re.I):
        raise SystemExit('Unexpected executable inline JavaScript on event advertising page')

    print('Public event advertising CSS contract is valid.')


if __name__ == '__main__':
    main()
