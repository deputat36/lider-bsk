# Публичный сайт РА «Лидер»: общий CSS для простых страниц услуг

Дата: 2026-07-14.

Контур: только публичный сайт.

## Страницы

- `socseti-kontent.html`;
- `dizayn-maketov.html`.

## Что изменено

Обе страницы использовали почти одинаковый inline CSS. Повторяющиеся стили перенесены в единый файл:

- `assets/public-simple-service.css?v=1`.

Различие hero-фона сохранено через классы страницы:

- `page-social-content`;
- `page-design-service`.

## Что сохранено

- заголовки и клиентские тексты;
- по шесть карточек услуг на каждой странице;
- canonical и robots;
- телефон;
- форма `public-lead-form.js?v=5`;
- стили формы `public-lead-form.css?v=4`;
- мобильный breakpoint 860 px;
- отсутствие page-specific JavaScript.

## Польза

- один HTTP-кешируемый stylesheet вместо двух повторяющихся inline-блоков;
- меньше размер HTML;
- проще синхронно поддерживать адаптивность;
- ниже риск визуального расхождения двух родственных страниц;
- страницы ближе к CSP-ready архитектуре.

## Постоянная защита

Добавлены:

- `tools/check_public_simple_service_css.py`;
- `.github/workflows/public-simple-service-css-check.yml`.

Контракт проверяет обе страницы одновременно, порядок CSS, разные hero-варианты, количество карточек, форму, canonical и отсутствие inline CSS/JavaScript.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-заявки и audit;
- содержание услуг и коммерческие обещания.
