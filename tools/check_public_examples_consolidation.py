#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ROOT / 'primery-rabot-kejsy.html'
LEGACY = ROOT / 'portfolio.html'
SITEMAP = ROOT / 'sitemap.xml'
OG_CONFIG = ROOT / 'tools' / 'open_graph_pages.json'
SCHEMA_CONFIG = ROOT / 'tools' / 'structured_data_pages.json'


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def forbid(text: str, marker: str, source: Path) -> None:
    if marker in text:
        raise SystemExit(f'Forbidden {marker!r} in {source.relative_to(ROOT)}')


def main() -> None:
    examples = EXAMPLES.read_text(encoding='utf-8')
    legacy = LEGACY.read_text(encoding='utf-8')
    sitemap = SITEMAP.read_text(encoding='utf-8')
    og = json.loads(OG_CONFIG.read_text(encoding='utf-8'))
    schema = json.loads(SCHEMA_CONFIG.read_text(encoding='utf-8'))

    for marker in (
        '<title>Примеры рекламных задач в Борисоглебске | РА Лидер</title>',
        '<meta name="robots" content="index, follow">',
        '<link rel="canonical" href="https://www.lider-bsk.ru/primery-rabot-kejsy.html">',
        'Не вымышленные кейсы, а понятные сценарии заказа',
        'Они не выдаются за реальные работы или отзывы клиентов.',
        'Фотографии конкретных выполненных заказов публикуются только после отбора материалов и согласования с заказчиками.',
        'data-leader-lead-form',
        'assets/public-lead-form.js',
        'Получите номер',
    ):
        require(examples, marker, EXAMPLES)

    for marker in (
        'Место для фото',
        'Шаблон кейсов для будущего наполнения',
        'структура под реальные фото',
        'Какие работы можно показать клиентам',
        'Пока на странице можно постепенно добавлять реальные фотографии',
    ):
        forbid(examples, marker, EXAMPLES)

    for marker in (
        '<meta name="robots" content="noindex, follow">',
        '<link rel="canonical" href="https://www.lider-bsk.ru/primery-rabot-kejsy.html">',
        'url=primery-rabot-kejsy.html',
        "location.replace('primery-rabot-kejsy.html')",
    ):
        require(legacy, marker, LEGACY)

    require(sitemap, 'https://www.lider-bsk.ru/primery-rabot-kejsy.html', SITEMAP)
    forbid(sitemap, 'https://www.lider-bsk.ru/portfolio.html', SITEMAP)

    og_paths = {page['path'] for page in og['pages']}
    schema_paths = {page['path'] for page in schema['pages']}
    for paths, source in ((og_paths, OG_CONFIG), (schema_paths, SCHEMA_CONFIG)):
        if 'primery-rabot-kejsy.html' not in paths:
            raise SystemExit(f'Examples page missing from {source.relative_to(ROOT)}')
        if 'portfolio.html' in paths:
            raise SystemExit(f'Legacy portfolio remains in {source.relative_to(ROOT)}')

    print('Public examples consolidation contract is valid.')


if __name__ == '__main__':
    main()
