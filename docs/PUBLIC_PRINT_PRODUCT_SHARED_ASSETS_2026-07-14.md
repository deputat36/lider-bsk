# Публичный сайт РА «Лидер»: общие assets для полиграфических страниц

Дата: 2026-07-14.

Контур: только публичный сайт.

## Товарные страницы

- `blanki-borisoglebsk.html`;
- `buklety-borisoglebsk.html`;
- `gramoty-borisoglebsk.html`;
- `menyu-dlya-kafe-borisoglebsk.html`;
- `otkrytki-priglasheniya-borisoglebsk.html`;
- `kalendari-borisoglebsk.html`;
- `birki-etiketki-borisoglebsk.html`;
- `papki-konverty-borisoglebsk.html`;
- `razdatochnye-materialy-borisoglebsk.html`.

Девять страниц используют:

- `assets/public-print-product.css?v=1`;
- `assets/public-print-product.js?v=1`.

## Полиграфический хаб

`poligrafiya-borisoglebsk.html` сохраняет собственный stylesheet и визуальную систему, но использует общий `assets/public-print-product.js?v=1` для предзаполнения формы.

Общий JavaScript активируется только при наличии явных `data-lead-service` или `data-lead-message` на `<body>`. Это позволяет применять его к разным визуальным шаблонам без скрытой зависимости от CSS-класса.

## Что изменено

- девять одинаковых inline CSS-блоков заменены одним кешируемым stylesheet;
- десять одинаковых inline form-preset скриптов заменены одним data-driven JavaScript;
- индивидуальный текст заявки хранится в `data-lead-message`;
- услуга хранится в `data-lead-service`;
- полиграфический хаб не подключает товарный CSS и сохраняет собственный дизайн.

## Что сохранено

- все клиентские тексты;
- 54 карточки на девяти товарных страницах;
- шесть карточек на полиграфическом хабе;
- индивидуальные H1 и CTA;
- canonical и robots;
- телефон;
- общая форма `public-lead-form.js?v=5`;
- блок связанных услуг `public-related-services.js?v=2`;
- сервис «Полиграфия»;
- точные сообщения каждой страницы;
- Service JSON-LD хаба;
- мобильный breakpoint 900 px.

## Польза

- один кешируемый stylesheet вместо девяти inline CSS-блоков;
- один data-driven preset вместо десяти inline JavaScript-блоков;
- меньше HTML;
- синхронная поддержка формы;
- ниже риск расхождения сообщений и поведения;
- страницы ближе к CSP-ready архитектуре.

## Постоянная защита

Используются:

- `tools/check_public_print_product_assets.py`;
- `.github/workflows/public-print-product-assets-check.yml`.

Контракт проверяет девять товарных страниц, 54 товарные карточки и полиграфический хаб: индивидуальные тексты, порядок assets, форму, canonical, телефон, отсутствие inline CSS/исполняемого JavaScript на товарных страницах и сохранность отдельного дизайна хаба. JavaScript проходит `node --check`.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-заявки и audit;
- содержание услуг и коммерческие обещания.