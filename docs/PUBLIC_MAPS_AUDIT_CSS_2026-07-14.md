# Публичный сайт РА «Лидер»: CSS страницы аудита карт

Дата: 2026-07-14.

Контур: только публичный сайт.

## Страница

- `audit-kart-yandex-2gis-borisoglebsk.html`.

## Что изменено

Большой inline CSS перенесён в отдельный кешируемый файл:

- `assets/public-maps-audit.css?v=1`.

## Что сохранено

- верхняя информационная полоса и sticky header;
- hero с двумя колонками;
- блок «Что проверим»;
- три причины важности аудита;
- три ценовых ориентира: от 1 000 ₽, от 2 000 ₽ и от 3 500 ₽;
- шесть карточек суммарно;
- Service JSON-LD;
- canonical, robots и Open Graph;
- телефон и политика обработки данных;
- `data-service="Яндекс Карты и 2ГИС"`;
- форма `public-lead-form.js?v=5`;
- стили формы `public-lead-form.css?v=4`;
- мобильный breakpoint 900 px.

## Польза

- CSS кешируется отдельно от HTML;
- страница меньше и проще для поддержки;
- ниже риск случайного изменения ценовых и конверсионных блоков при работе со стилями;
- страница ближе к CSP-ready архитектуре.

## Постоянная защита

Добавлены:

- `tools/check_public_maps_audit_css.py`;
- `.github/workflows/public-maps-audit-css-check.yml`.

Контракт проверяет порядок CSS, шесть карточек, три цены, форму, Service JSON-LD, CTA, canonical и отсутствие inline CSS или executable JavaScript.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-заявки и audit;
- клиентские тексты и коммерческие ориентиры.
