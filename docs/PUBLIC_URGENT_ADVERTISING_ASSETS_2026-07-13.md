# Публичный сайт РА «Лидер»: assets страницы срочной рекламы

Дата: 2026-07-13.

Контур: только публичный сайт.

## Изменение

Страница `srochnaya-reklama-borisoglebsk.html` переведена с inline CSS и executable inline JavaScript на внешние кешируемые assets:

- `assets/public-urgent-advertising.css?v=1`;
- `assets/public-urgent-advertising.js?v=1`.

## Что сохранено

- шесть ситуаций срочного обращения;
- шесть быстрых рекламных услуг;
- два блока данных для расчёта;
- предупреждение об ограничениях срочного заказа;
- четыре этапа срочной заявки;
- Service JSON-LD;
- canonical, robots, Open Graph и Twitter metadata;
- `public-lead-form.css?v=19`;
- `public-lead-form.js?v=19`;
- `mobile-sticky-cta.js?v=1`;
- preset сообщения `Срочная заявка: нужно быстро рассчитать рекламу. Срок: `.

## Порядок загрузки

CSS:

1. общие стили формы;
2. page-specific CSS.

JavaScript:

1. общая форма;
2. mobile sticky CTA;
3. page-specific preset.

## Проверка

Добавлены:

- `tools/check_public_urgent_advertising_assets.py`;
- `.github/workflows/public-urgent-advertising-assets-check.yml`.

Контракт проверяет 14 карточек, четыре этапа, service-prefill, порядок assets, отсутствие inline executable code, ключевые CSS-селекторы и синтаксис JS через `node --check`.

## Не изменено

- клиентские тексты;
- сроки и коммерческие обещания;
- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth, Edge Functions и production data.
