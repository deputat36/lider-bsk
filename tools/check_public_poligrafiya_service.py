#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
page = (root / 'poligrafiya-borisoglebsk.html').read_text(encoding='utf-8')
handouts = (root / 'razdatochnye-materialy-borisoglebsk.html').read_text(encoding='utf-8')
pechat_bannerov = (root / 'pechat-bannerov-borisoglebsk.html').read_text(encoding='utf-8')
banner_shop = (root / 'banner-dlya-magazina-borisoglebsk.html').read_text(encoding='utf-8')
stickers = (root / 'nakleyki-na-vitrinu-borisoglebsk.html').read_text(encoding='utf-8')
working_hours = (root / 'rezhim-raboty-tablichki-borisoglebsk.html').read_text(encoding='utf-8')
form = (root / 'assets' / 'public-lead-form.js').read_text(encoding='utf-8')
print_preset = (root / 'assets' / 'public-print-product.js').read_text(encoding='utf-8')

checks = [
    ('polygraphy hub declares Polygraphy service', 'data-lead-service="Полиграфия"' in page),
    ('polygraphy hub message mentions polygraphy', 'data-lead-message="Страница: полиграфия' in page),
    ('polygraphy hub loads shared print preset', 'assets/public-print-product.js?v=1' in page),
    ('polygraphy hub has no executable inline preset', "service.options[i].value==='Полиграфия'" not in page),
    ('handouts page uses lead form v5', 'assets/public-lead-form.js?v=5' in handouts),
    ('handouts page declares Polygraphy service', 'data-lead-service="Полиграфия"' in handouts),
    ('handouts page message mentions handout materials', 'data-lead-message="Страница: раздаточные материалы' in handouts),
    ('handouts page loads shared print CSS', 'assets/public-print-product.css?v=1' in handouts),
    ('handouts page loads shared print preset', 'assets/public-print-product.js?v=1' in handouts),
    ('print preset reads explicit service data', "page.getAttribute('data-lead-service')||'Полиграфия'" in print_preset),
    ('print preset reads explicit message data', "page.getAttribute('data-lead-message')||''" in print_preset),
    ('print preset can add missing service option', 'service.add(new Option(serviceName,serviceName))' in print_preset),
    ('print preset does not submit independently', 'fetch(' not in print_preset and 'XMLHttpRequest' not in print_preset),
    ('pechat bannerov page sets service to Banner', "service.value='Баннер'" in pechat_bannerov),
    ('shop banner page sets service to Banner', "service.value='Баннер'" in banner_shop),
    ('stickers page exposes Stickers CTA', 'data-service="Наклейки"' in stickers),
    ('stickers page uses shared v5 form', 'assets/public-lead-form.js?v=5' in stickers),
    ('form has stickers page preset', "'nakleyki-na-vitrinu-borisoglebsk.html':{service:'Наклейки'" in form),
    ('working hours page exposes Sign CTA', 'data-service="Табличка"' in working_hours),
    ('working hours page uses shared v5 form', 'assets/public-lead-form.js?v=5' in working_hours),
    ('form has working hours page preset', "'rezhim-raboty-tablichki-borisoglebsk.html':{service:'Табличка'" in form),
    ('specialized pages do not set service to Other', "service.value='Другое'" not in page + handouts + pechat_bannerov + banner_shop + stickers + working_hours),
    ('form has polygraphy page preset', 'poligrafiya-borisoglebsk.html' in form and "service:'Полиграфия'" in form),
    ('form has Polygraphy option', '<option>Полиграфия</option>' in form),
]

failed = [name for name, ok in checks if not ok]
if failed:
    print('Missing checks: ' + '; '.join(failed))
    sys.exit(1)

print('Specialized public pages send correct service values through shared and page-specific presets.')