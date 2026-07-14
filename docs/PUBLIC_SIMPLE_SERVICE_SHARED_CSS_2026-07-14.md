# Публичный сайт РА «Лидер»: общий CSS для простых страниц услуг

Дата: 2026-07-14.

Контур: только публичный сайт.

## Страницы

- `socseti-kontent.html`;
- `dizayn-maketov.html`;
- `logotip-firmennyy-stil.html`;
- `yandex-karty-2gis.html`;
- `bannery-borisoglebsk.html`;
- `tablichki-borisoglebsk.html`;
- `vyveski-borisoglebsk.html`;
- `pechat-na-plenke-borisoglebsk.html`;
- `oformlenie-vitrin-borisoglebsk.html`;
- `outdoor-advertising-borisoglebsk.html`;
- `nakleyki-plotternaya-rezka-borisoglebsk.html`.

## Что изменено

Одиннадцать страниц используют одну визуальную систему: hero, сетку карточек, информационный блок, CTA и одинаковый мобильный breakpoint. Повторяющиеся стили перенесены в единый файл:

- `assets/public-simple-service.css`.

Первые четыре страницы продолжают использовать cache marker `v=1`, следующая группа из пяти страниц — `v=2`, а две новые страницы — `v=3`. Это гарантирует получение расширенного набора page-классов без массового изменения уже проверенных страниц.

Различия hero-фона и локальных визуальных параметров сохранены через классы страницы:

- `page-social-content`;
- `page-design-service`;
- `page-brand-identity`;
- `page-maps-listing`;
- `page-banner-service`;
- `page-signage-service`;
- `page-shop-sign-service`;
- `page-film-print-service`;
- `page-window-branding`;
- `page-outdoor-overview`;
- `page-plotter-stickers`.

Для обзорной страницы наружной рекламы отдельно сохранены исходная ширина hero-текста и цвет ссылки возврата.

## Что сохранено

- заголовки и клиентские тексты;
- по шесть карточек услуг на каждой странице;
- canonical и robots;
- Open Graph и существующий JSON-LD;
- телефон;
- форма `public-lead-form.js?v=5`;
- стили формы `public-lead-form.css?v=4`;
- мобильный breakpoint 860 px;
- отсутствие page-specific executable JavaScript.

## Польза

- один HTTP-кешируемый stylesheet вместо одиннадцати повторяющихся inline-блоков;
- меньше размер HTML;
- проще синхронно поддерживать адаптивность;
- ниже риск визуального расхождения родственных страниц;
- страницы ближе к CSP-ready архитектуре.

## Постоянная защита

Используются:

- `tools/check_public_simple_service_css.py`;
- `.github/workflows/public-simple-service-css-check.yml`.

Контракт проверяет одиннадцать страниц одновременно, порядок CSS, hero-варианты, количество карточек, форму, canonical и отсутствие inline CSS или executable JavaScript. JSON-LD остаётся допустимым структурированным содержимым.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-заявки и audit;
- содержание услуг и коммерческие обещания.
