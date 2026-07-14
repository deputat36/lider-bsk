# Публичный сайт РА «Лидер»: общий CSS для простых страниц услуг

Дата: 2026-07-14.

Контур: только публичный сайт.

## Страницы

- `socseti-kontent.html`;
- `dizayn-maketov.html`;
- `logotip-firmennyy-stil.html`;
- `yandex-karty-2gis.html`.

## Что изменено

Четыре страницы использовали одинаковую или почти одинаковую визуальную систему. Повторяющиеся стили перенесены в единый файл:

- `assets/public-simple-service.css?v=1`.

Различия hero-фона сохранены через классы страницы:

- `page-social-content`;
- `page-design-service`;
- `page-brand-identity`;
- `page-maps-listing`.

## Что сохранено

- заголовки и клиентские тексты;
- по шесть карточек услуг на каждой странице;
- canonical и robots;
- Open Graph и JSON-LD страницы карт;
- телефон;
- форма `public-lead-form.js?v=5`;
- стили формы `public-lead-form.css?v=4`;
- мобильный breakpoint 860 px;
- отсутствие page-specific executable JavaScript.

## Польза

- один HTTP-кешируемый stylesheet вместо четырёх повторяющихся inline-блоков;
- меньше размер HTML;
- проще синхронно поддерживать адаптивность;
- ниже риск визуального расхождения родственных страниц;
- страницы ближе к CSP-ready архитектуре.

## Постоянная защита

Добавлены:

- `tools/check_public_simple_service_css.py`;
- `.github/workflows/public-simple-service-css-check.yml`.

Контракт проверяет четыре страницы одновременно, порядок CSS, hero-варианты, количество карточек, форму, canonical и отсутствие inline CSS или executable JavaScript. JSON-LD остаётся допустимым структурированным содержимым.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-заявки и audit;
- содержание услуг и коммерческие обещания.
