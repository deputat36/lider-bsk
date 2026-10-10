#!/usr/bin/env python3
"""Author the creative hub and verified portfolio from owner-supplied materials."""
from pathlib import Path
from html import escape
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://www.lider-bsk.ru/'
reference = (ROOT / 'vyveski-borisoglebsk.html').read_text()
header = re.search(r'<a class="skip-link".*?<main id="main">', reference, re.S).group(0)
footer = re.search(r'<footer class="service-footer">.*?</footer>', reference, re.S).group(0)

def page(name, title, description, content, service_id):
    url = ORIGIN + name
    schema = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'CollectionPage', '@id': url+'#page', 'url': url, 'name': title,
         'description': description, 'inLanguage': 'ru-RU'},
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Главная', 'item': ORIGIN},
            {'@type': 'ListItem', 'position': 2, 'name': title, 'item': url}]}]}
    return f'''<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} | РА Лидер</title><meta name="description" content="{escape(description,quote=True)}">
<meta name="robots" content="index, follow"><link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:locale" content="ru_RU"><meta property="og:site_name" content="РА Лидер">
<meta property="og:title" content="{escape(title,quote=True)} | РА Лидер"><meta property="og:description" content="{escape(description,quote=True)}"><meta property="og:url" content="{url}">
<meta property="og:image" content="{ORIGIN}assets/og-lider-default.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{escape(title,quote=True)} | РА Лидер"><meta name="twitter:description" content="{escape(description,quote=True)}"><meta name="twitter:image" content="{ORIGIN}assets/og-lider-default.png">
<link rel="stylesheet" href="assets/public-lead-form.css?v=28"><link rel="stylesheet" href="assets/public-simple-service.css?v=7"><link rel="stylesheet" href="assets/public-commercial-services.css?v=1"><link rel="stylesheet" href="assets/public-creative-services.css?v=1">
<link rel="icon" type="image/svg+xml" href="assets/brand/logo-lider-mark.svg?v=4"><link rel="stylesheet" href="assets/public-product-system.css?v=1">
<script type="application/ld+json">{json.dumps(schema,ensure_ascii=False,separators=(',',':'))}</script>
</head><body class="page-service-modern page-commercial-service" data-commercial-service="{service_id}">
{header}{content}
<section class="section" id="request"><div class="wrap"><div class="cta"><div><h2>Обсудим вашу задачу</h2><p>Опишите, что хотите получить, где будет использоваться результат и когда он нужен. Подробности можно уточнить вместе.</p><p><strong>Телефон:</strong> <a href="tel:+79802457471">8 980 245-74-71</a></p></div><div id="leader-lead-form"></div></div></div></section>
</main>{footer}
<script src="assets/packages-link.js?v=2" defer></script><script src="assets/leader-service-catalog.js?v=2"></script><script src="assets/public-lead-form.js?v=31"></script>
</body></html>
'''

hub = '''
<section class="hero"><div class="wrap creative-split"><div><a class="back" href="uslugi.html">Все услуги</a><p class="commercial-direction">От идеи до материалов для рекламы</p><h1>Дизайн, 3D-визуализация и анимация</h1><p>Сначала увидеть будущую вывеску. Согласовать конструкцию. Подготовить макет или ролик — и только затем переходить к изготовлению и размещению.</p><div class="service-actions"><a class="btn" href="#formats">Выбрать задачу</a><a class="service-secondary" href="#request">Обсудить проект</a></div></div><figure class="creative-photo"><img src="assets/portfolio/volume-letters-production/letters-production.jpg" width="1264" height="1536" alt="Объёмные розовые буквы «ЦВЕТЫ» на рабочем столе в мастерской" fetchpriority="high"><figcaption>Объёмные буквы «ЦВЕТЫ». Фото этапа производства.</figcaption></figure></div></section>
<section class="section" id="formats"><div class="wrap"><h2>Что вы хотите получить?</h2><p>Можно начать с одной задачи и добавить другие этапы после согласования.</p><div class="grid service-formats">
<article class="card"><h3>Увидеть рекламу на объекте</h3><p>Вывеска на фото фасада, дневной и ночной вид, входная группа, стела или интерьер.</p><a href="3d-vizualizaciya-reklamy.html">3D-визуализация</a></article>
<article class="card"><h3>Показать объёмную конструкцию</h3><p>Модель вывески, баннера, стелы или пространства для обсуждения формы и деталей.</p><a href="3d-modelirovanie-konstrukciy.html">3D-моделирование</a></article>
<article class="card"><h3>Получить 2D-макет</h3><p>Баннер, листовка, буклет, вывеска, иллюстрация или материалы для согласования.</p><a href="dizayn-maketov.html">Дизайн макетов</a></article>
<article class="card"><h3>Подготовить рекламный ролик</h3><p>2D/3D-анимация для LED-экрана, сайта, соцсетей или презентации сложного проекта.</p><a href="animaciya-motion-dizayn.html">Анимация и моушн-дизайн</a></article>
<article class="card"><h3>Передать файл в печать</h3><p>Широкоформатный макет, ретушь, цветокоррекция и подготовка под требования производства.</p><a href="podgotovka-maketov-k-pechati.html">Подготовка к печати</a></article>
<article class="card"><h3>Объединить дизайн и изготовление</h3><p>Согласуем макет, отдельно рассчитаем печать, конструкцию и монтаж, если они нужны.</p><a href="komplekty-reklamy.html">Комплект рекламы</a></article>
</div></div></section>
<section class="section soft"><div class="wrap"><h2>С чего удобнее начать вам?</h2><div class="creative-scenarios">
<article class="card"><h3>Владельцу бизнеса</h3><p>«Не знаю, какая вывеска подойдёт». Начните с фото фасада и описания бизнеса. Поможем выбрать состав и показать будущий вид.</p><a href="3d-vizualizaciya-reklamy.html#request">Показать мою задачу</a></article>
<article class="card"><h3>Агентству или подрядчику</h3><p>«Нужно представить проект своему заказчику». Укажите объект, размеры, формат результата и требования к исходникам.</p><a href="3d-modelirovanie-konstrukciy.html#request">Обсудить модель проекта</a></article>
<article class="card"><h3>Дизайнеру или маркетологу</h3><p>«Есть материалы, нужна адаптация». Расскажите о площадках, размерах, версии для печати или технических требованиях экрана.</p><a href="podgotovka-maketov-k-pechati.html#request">Подготовить материалы</a></article>
</div></div></section>
<section class="section"><div class="wrap"><h2>Три состава заказа</h2><p>Это варианты комплектации. Стоимость, срок, число вариантов и правок согласуем после брифа.</p><div class="creative-packages">
<article class="card"><h3>Макет на согласование</h3><p>Для понятной задачи, когда нужно показать текст, композицию и размеры.</p><ul><li>2D-макет</li><li>просмотрный файл</li><li>согласованный объём исправлений</li></ul><a class="btn" href="dizayn-maketov.html?service=design#request">Заказать макет</a></article>
<article class="card"><h3>Увидеть на объекте</h3><p>Когда важно оценить пропорции и сочетание рекламы с фасадом или пространством.</p><ul><li>модель, если требуется</li><li>согласованные ракурсы</li><li>изображения для обсуждения</li></ul><a class="btn" href="3d-vizualizaciya-reklamy.html?service=visualization-3d#request">Обсудить визуализацию</a></article>
<article class="card"><h3>Подготовить запуск</h3><p>Когда нужны связанные материалы для печати, размещения и цифровой рекламы.</p><ul><li>макеты под выбранные носители</li><li>ролик или версии для площадок при необходимости</li><li>отдельный расчёт изготовления и монтажа</li></ul><a class="btn" href="dizayn-3d-animaciya.html?service=campaign#request">Подобрать комплект</a></article>
</div><p class="creative-composition">До начала работы фиксируем результат, форматы, число ракурсов и версий, порядок правок, сроки и состав исходников. Изготовление, монтаж и размещение включаются только по согласованному составу.</p></div></section>
<section class="section soft"><div class="wrap"><h2>Посмотрите материалы работ</h2><p>Фотография производства и 2D-макет показывают разные этапы. Подписи помогают понять, что именно вы видите.</p><nav class="creative-links" aria-label="Работы и следующие этапы"><a href="nashi-raboty.html">Фото и макеты</a><a href="vyveski-borisoglebsk.html">Изготовление вывесок</a><a href="pechat-bannerov-borisoglebsk.html">Печать баннеров</a><a href="socseti-kontent.html">Контент для соцсетей</a></nav></div></section>
'''

manifest = json.loads((ROOT / 'docs/PUBLIC_PORTFOLIO_MANIFEST_V1.json').read_text())
cards = []
images_schema = []
for project in manifest['projects']:
    if not project['publish']:
        continue
    for photo in project['photos']:
        assert (ROOT / photo['expected_web_path']).is_file(), 'Published portfolio image missing'
        assert photo['source_file'] and photo['width'] and photo['height'] and photo['alt']
    photo = project['photos'][0]
    e = lambda value: escape(str(value), quote=True)
    kind = project.get('material_kind', 'photo')
    stage = project.get('stage_label', 'Фото работы')
    links = ''.join(f'<a href="{e(page)}">{e(label)}</a>' for page, label in project['public_links'])
    cards.append(f'''<article class="work-card" id="{e(project['id'])}" data-work-kind="{e(kind)}"><figure><a href="{e(photo['expected_web_path'])}" aria-label="Открыть изображение: {e(project['owner_label'])}"><img src="{e(photo['expected_web_path'])}" width="{photo['width']}" height="{photo['height']}" alt="{e(photo['alt'])}" loading="lazy" decoding="async"></a><figcaption>{e(stage)}</figcaption></figure><div class="work-card__copy"><p class="work-stage">{e(stage)}</p><h2>{e(project['owner_label'])}</h2><p>{e(project['public_description'])}</p><nav class="creative-links" aria-label="Услуги по работе {e(project['owner_label'])}">{links}</nav></div></article>''')
    images_schema.append({'@type': 'ImageObject', 'contentUrl': ORIGIN+photo['expected_web_path'],
        'caption': photo['alt'], 'width': photo['width'], 'height': photo['height']})

works = '''<section class="hero"><div class="wrap"><a class="back" href="uslugi.html">Все услуги</a><p class="commercial-direction">Фотографии и макеты</p><h1>Работы и материалы проектов</h1><p>Посмотрите этап производства и пример 2D-макета. В подписи указано, что именно показано: фотография изделия или графический материал.</p><div class="service-actions"><a class="btn" href="#works">Посмотреть материалы</a><a class="service-secondary" href="#request">Обсудить похожую задачу</a></div></div></section>
<section class="section soft" id="works"><div class="wrap"><div class="work-grid">'''+''.join(cards)+'''</div></div></section>
<section class="section"><div class="wrap"><h2>От идеи к результату</h2><p>2D-макет помогает согласовать композицию. 3D-визуализация показывает предполагаемый вид на объекте. Фотография производства или установленной рекламы показывает фактическую стадию работы.</p><nav class="creative-links" aria-label="Выбор услуги"><a href="dizayn-3d-animaciya.html">Выбрать дизайн, 3D или ролик</a><a href="primery-rabot-kejsy.html">Примеры типовых задач</a></nav></div></section>'''
works += '<script type="application/ld+json">'+json.dumps({'@context': 'https://schema.org','@type':'CollectionPage','@id':ORIGIN+'nashi-raboty.html#page','hasPart':images_schema},ensure_ascii=False,separators=(',',':'))+'</script>'

outputs = {
    'dizayn-3d-animaciya.html': page('dizayn-3d-animaciya.html', 'Дизайн, 3D-визуализация и анимация для рекламы', '3D-модели, визуализация вывесок на фасаде, 2D-макеты, анимация для LED и digital, ретушь и подготовка к печати. Выберите задачу и получите расчёт.', hub, 'design'),
    'nashi-raboty.html': page('nashi-raboty.html', 'Работы и материалы проектов РА Лидер', 'Фотография производства объёмных букв и макет наклейки из материалов проектов. Посмотрите этапы работ и обсудите похожую задачу.', works, 'campaign'),
}
for name, content in outputs.items():
    target = ROOT / name
    if '--check' in sys.argv:
        assert target.exists() and target.read_text() == content, f'Generated page differs: {name}'
    else:
        target.write_text(content)
print('Creative hub and verified work materials: '+('PASS' if '--check' in sys.argv else 'generated'))
