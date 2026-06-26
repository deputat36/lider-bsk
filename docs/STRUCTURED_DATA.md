# Микроразметка JSON-LD для сайта РА «Лидер»

Дата: 2026-06-26.

## Цель

Добавить на публичные коммерческие страницы сайта понятную JSON-LD микроразметку для поисковых систем:

- `LocalBusiness` — рекламное агентство РА «Лидер»;
- `WebSite` — сайт агентства;
- `WebPage` — текущая страница;
- `Service` — конкретная услуга на посадочных страницах;
- `BreadcrumbList` — хлебные крошки;
- `CollectionPage` — для портфолио.

## Файлы автоматизации

- `tools/structured_data_pages.json` — единый конфиг страниц, названий, описаний и типов услуг;
- `tools/apply_structured_data.py` — dependency-free инструмент для проверки и вставки JSON-LD блоков.

## Как проверить

```bash
python3 tools/apply_structured_data.py --check
```

Если микроразметка ещё не вставлена в HTML, команда покажет список страниц и предложит применить инструмент.

## Как применить

```bash
python3 tools/apply_structured_data.py --apply
python3 tools/apply_structured_data.py --check
```

После применения нужно проверить diff HTML-страниц и открыть отдельный PR.

## Как вставляется блок

Скрипт добавляет перед `</head>` помеченный блок:

```html
<!-- Structured data / JSON-LD -->
<script type="application/ld+json">...</script>
```

Если на странице уже есть такой помеченный блок, он заменяется. На главной странице старый короткий JSON-LD `LocalBusiness` для РА «Лидер» удаляется, чтобы не было дублей.

## Страницы в конфиге

- `index.html` — главная;
- `prices.html` — цены;
- `portfolio.html` — портфолио;
- `bannery-borisoglebsk.html` — баннеры;
- `vyveski-borisoglebsk.html` — вывески;
- `nakleyki-plotternaya-rezka-borisoglebsk.html` — наклейки и плоттерная резка;
- `outdoor-advertising-borisoglebsk.html` — наружная реклама;
- `reklama-dlya-biznesa.html` — реклама для бизнеса;
- `reklama-dlya-magazina-borisoglebsk.html` — реклама для магазина;
- `reklama-dlya-kafe-borisoglebsk.html` — реклама для кафе;
- `reklama-v-soobshchestvah-borisoglebska.html` — реклама в сообществах;
- `yandex-karty-2gis.html` — Яндекс Карты и 2ГИС.

## Следующий шаг

Запустить `python3 tools/apply_structured_data.py --apply`, проверить изменения HTML и влить отдельным PR фактическую микроразметку на страницы.
