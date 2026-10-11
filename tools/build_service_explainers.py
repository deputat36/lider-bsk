#!/usr/bin/env python3
"""Update bounded static explanation blocks; existing service content stays authored."""
import json
import re
import subprocess
import sys
from service_explainers import (
    CATALOG_GROUPS, CREATIVE, CSS, DATA, END, ROOT, START, render_block, render_cards,
)

registry = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "await import('./assets/leader-service-catalog.js');console.log(JSON.stringify(globalThis.LeaderServiceCatalog));",
], cwd=ROOT, text=True))
labels = {item['id']: item['label'] for item in registry['services']}
expected = set(labels) - {'other'}
actual = {item['id'] for item in DATA['services']}
if expected != actual or len(actual) != len(DATA['services']):
    raise SystemExit('Explanation IDs must match all real services in the shared catalog')

commercial_ids = {item['id'] for item in json.loads((ROOT / 'data/commercial-services.json').read_text())}
pages = {}
for item in DATA['services']:
    if item['id'] not in commercial_ids:
        pages.setdefault(item['page'], []).append(item['id'])


def with_css(text):
    text = re.sub(r'\n?' + re.escape(CSS), '', text, count=1)
    shared = '<link rel="stylesheet" href="assets/public-product-system.css?v=1">'
    if shared not in text:
        raise ValueError('Missing shared product stylesheet')
    return text.replace(shared, CSS + '\n' + shared, 1)


def update_page(text, service_ids):
    text = re.sub(r'\n?' + re.escape(START) + r'.*?' + re.escape(END), '', text, flags=re.S)
    blocks = '\n'.join(render_block(sid, labels[sid]) for sid in service_ids)
    main = re.search(r'<main\b[^>]*>', text)
    if not main:
        raise ValueError('Service page needs a main element')
    hero = re.match(r'\s*<section class="hero">.*?</section>', text[main.end():], re.S)
    position = main.end() + hero.end() if hero else main.end()
    return with_css(text[:position] + '\n' + blocks + text[position:])


def update_catalog(text):
    text = with_css(text)
    def structured_list(match):
        graph = json.loads(match[1])
        list_id = 'https://www.lider-bsk.ru/uslugi.html#services-list'
        graph['@graph'] = [node for node in graph['@graph'] if node.get('@id') != list_id]
        graph['@graph'].append({
            '@type': 'ItemList', '@id': list_id, 'name': 'Услуги РА Лидер',
            'numberOfItems': len(DATA['services']),
            'itemListElement': [
                {'@type': 'ListItem', 'position': i, 'name': item['title'],
                 'url': 'https://www.lider-bsk.ru/' + item['page'] + ('#' + item['anchor'] if item.get('anchor') else '')}
                for i, item in enumerate(DATA['services'], 1)
            ],
        })
        return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False, separators=(',', ':')) + '</script>'
    text = re.sub(r'<script type="application/ld\+json">(.*?)</script>', structured_list, text, count=1, flags=re.S)
    for direction, service_ids in CATALOG_GROUPS.items():
        pattern = r'(<article class="group" id="' + direction + r'">.*?)<div class="service-list(?: service-cards)?">.*?</div>(?=<details class="service-more">)'
        text, count = re.subn(pattern, lambda m: m[1] + render_cards(service_ids), text, count=1, flags=re.S)
        if count != 1:
            raise ValueError('Missing catalog group: ' + direction)
    pattern = r'(<section id="creative">.*?</div>)<div class="(?:links|service-list service-cards creative-service-cards)">.*?</div>'
    text, count = re.subn(pattern, lambda m: m[1] + render_cards(CREATIVE, creative=True), text, count=1, flags=re.S)
    if count != 1:
        raise ValueError('Missing creative catalog group')
    catalog_note = '<p class="service-illustration-note">Изображения поясняют услуги. Реальные фотографии и макеты смотрите в <a href="nashi-raboty.html">материалах работ</a>.</p>'
    if catalog_note not in text:
        text = text.replace('<div class="catalog">', catalog_note + '<div class="catalog">', 1)
    hub_links = '<p class="service-catalog-related"><a href="dizayn-3d-animaciya.html">Выбрать состав творческого заказа</a> · <a href="nashi-raboty.html">Фото и макеты работ</a></p>'
    if hub_links not in text:
        text = text.replace('</div></div></section>\n\n    <section class="soft">', '</div>' + hub_links + '</div></section>\n\n    <section class="soft">', 1)
    return text


errors = []
for name, service_ids in pages.items():
    target = ROOT / name
    before = target.read_text()
    after = update_page(before, service_ids)
    if '--check' in sys.argv:
        if before != after:
            errors.append(name)
    else:
        target.write_text(after)
catalog = ROOT / 'uslugi.html'
before = catalog.read_text()
after = update_catalog(before)
if '--check' in sys.argv:
    if before != after:
        errors.append(catalog.name)
else:
    catalog.write_text(after)
if errors:
    raise SystemExit('Static explanations differ from source: ' + ', '.join(errors))
print(f'Service explanations {"verified" if "--check" in sys.argv else "updated"}: {len(DATA["services"])} services; {len(pages)} hand-authored pages + catalog')
