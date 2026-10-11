"""Authored static service explanations shared by page builders and the catalog."""
from html import escape
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / 'data/service-explainers.json').read_text())
SERVICES = {item['id']: item for item in DATA['services']}
CSS = '<link rel="stylesheet" href="assets/public-service-explainers.css?v=1">'
START = '<!-- service-explainer:start -->'
END = '<!-- service-explainer:end -->'
CATALOG_GROUPS = {
    'promotion': ['promoters', 'events', 'social', 'maps', 'marketplaces', 'campaign'],
    'branding': ['signs', 'identity', 'film', 'design', 'souvenirs', 'plates'],
    'automation': ['websites', 'automation', 'ai', 'apps', 'qr'],
    'production': ['banner', 'print', 'business-cards', 'stickers', 'plotter'],
}
CREATIVE = ['visualization-3d', 'modeling-3d', 'design', 'animation', 'prepress']


def e(value):
    return escape(str(value), quote=True)


def service_href(service_id):
    item = SERVICES[service_id]
    # A shared landing page keeps one canonical URL for stickers and cutting.
    query = '?service=' + service_id if service_id in {'plotter', 'campaign'} else ''
    anchor = '#' + item['anchor'] if item.get('anchor') else ''
    return item['page'] + query + anchor


def render_block(service_id, label=None):
    item = SERVICES[service_id]
    asset = item['illustration']
    alt = DATA['illustrations'][asset]['alt']
    section_id = item.get('anchor', 'service-explanation')
    result = ''.join('<li>' + e(text) + '</li>' for text in item['result'])
    return f'''{START}
<section class="section service-explainer" id="{e(section_id)}" data-service-explanation="{e(service_id)}"><div class="wrap service-explainer-grid">
<figure class="service-explainer-figure"><img src="assets/service-illustrations/{asset}.webp" srcset="assets/service-illustrations/{asset}-mobile.webp 720w, assets/service-illustrations/{asset}.webp 1080w" sizes="(max-width: 760px) calc(100vw - 32px), (max-width: 1160px) 46vw, 520px" width="1080" height="720" alt="{e(alt)}" loading="lazy" decoding="async"><figcaption>Иллюстрация услуги. Поясняющий пример, не фотография выполненной работы.</figcaption></figure>
<div class="service-explainer-copy"><p class="service-explainer-label">Услуга простыми словами</p><h2>{e(item['title'])}: что вы получите</h2><p>{e(item['purpose'])}</p><ul>{result}</ul><p class="service-explainer-prepare"><strong>Для начала:</strong> {e(item['prepare'])}</p><p class="service-explainer-boundary">{e(item['boundary'])}</p><a class="service-explainer-action" href="#request" data-service="{e(label or item['title'])}">Рассчитать мой вариант</a></div>
</div></section>
{END}'''


def render_cards(service_ids, creative=False):
    cards = []
    for service_id in service_ids:
        item = SERVICES[service_id]
        asset = item['illustration']
        cards.append(f'<a class="service-card" href="{e(service_href(service_id))}" data-service-explanation="{e(service_id)}"><img src="assets/service-illustrations/{asset}-thumb.webp" width="240" height="160" alt="" loading="lazy" decoding="async"><span class="service-card-copy"><strong>{e(item["title"])}</strong><span class="service-card-summary">{e(item["summary"])}</span><span class="service-card-next">Варианты и расчёт →</span></span></a>')
    classes = 'service-list service-cards' + (' creative-service-cards' if creative else '')
    return '<div class="' + classes + '">' + ''.join(cards) + '</div>'
