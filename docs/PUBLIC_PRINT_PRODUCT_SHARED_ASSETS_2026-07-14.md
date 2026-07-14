# Публичный сайт РА «Лидер»: общие assets для полиграфических товаров

Дата: 2026-07-14.

Контур: только публичный сайт.

## Страницы

- `blanki-borisoglebsk.html`;
- `buklety-borisoglebsk.html`;
- `gramoty-borisoglebsk.html`;
- `menyu-dlya-kafe-borisoglebsk.html`;
- `otkrytki-priglasheniya-borisoglebsk.html`;
- `kalendari-borisoglebsk.html`;
- `birki-etiketki-borisoglebsk.html`;
- `papki-konverty-borisoglebsk.html`.

## Что изменено

Восемь страниц использовали одинаковый inline CSS и одинаковую inline-логику предзаполнения формы. Они перенесены в два общих файла:

- `assets/public-print-product.css?v=1`;
- `assets/public-print-product.js?v=1`.

Индивидуальный текст заявки хранится в `data-lead-message`, а услуга — в `data-lead-service` на `<body>`.

## Что сохранено

- все клиентские тексты;
- 48 карточек суммарно;
- индивидуальные H1 и CTA;
- canonical и robots;
- телефон;
- общая форма `public-lead-form.js?v=5`;
- блок связанных услуг `public-related-services.js?v=2`;
- сервис «Полиграфия»;
- точные сообщения каждой страницы;
- мобильный breakpoint 900 px.

## Польза

- один кешируемый stylesheet вместо восьми inline CSS-блоков;
- один data-driven preset вместо восьми inline JavaScript-блоков;
- меньше HTML;
- синхронная поддержка формы;
- ниже риск расхождения сообщений и поведения;
- страницы ближе к CSP-ready архитектуре.

## Постоянная защита

Добавлены:

- `tools/check_public_print_product_assets.py`;
- `.github/workflows/public-print-product-assets-check.yml`.

Контракт проверяет восемь страниц одновременно, 48 карточек, индивидуальные тексты, порядок assets, форму, canonical, телефон и отсутствие inline CSS/исполняемого JavaScript. JavaScript также проходит `node --check`.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-заявки и audit;
- содержание услуг и коммерческие обещания.
