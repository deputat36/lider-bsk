# Публичный сайт РА «Лидер»: внешние assets баннерных страниц

Дата: 2026-07-15.

Контур: только публичный сайт.

## Страницы

- `pechat-bannerov-borisoglebsk.html`;
- `banner-dlya-magazina-borisoglebsk.html`.

## Что изменено

Обе страницы использовали одинаковый остаточный inline CSS поверх `assets/public-landing.css`. Общие стили вынесены в кешируемый файл:

- `assets/public-banner-detail.css?v=1`.

Страницы подключают стили в порядке:

1. `assets/public-landing.css?v=1`;
2. `assets/public-lead-form.css?v=4`;
3. `assets/public-banner-detail.css?v=1`.

Также удалены два одинаковых исполняемых inline prefill-скрипта. Они дублировали уже действующие записи `servicePresets` в:

- `assets/public-lead-form.js?v=5`.

Для каждой страницы сохранён собственный текст preset:

- печать баннеров;
- баннер для магазина.

## Что сохранено

- title, description, robots и canonical;
- Open Graph, Twitter Card и Service JSON-LD;
- заголовки, карточки, FAQ, цены и связанные услуги;
- телефон и политика обработки данных;
- `data-service="Баннер"` на основной CTA;
- контейнер формы `data-leader-lead-form`;
- мобильные breakpoint 920 и 560 px;
- клиентские тексты и коммерческие формулировки.

## Защита

Обновлены:

- `tools/check_public_pechat_bannerov_migration.py`;
- `tools/check_public_banner_store_migration.py`;
- `tools/check_public_landing_first_page_migration.py`;
- `tools/check_public_poligrafiya_service.py`;
- `.github/workflows/public-pechat-bannerov-migration-check.yml`;
- `.github/workflows/public-banner-store-migration-check.yml`.

Контракты проверяют:

- правильный порядок CSS;
- наличие общего banner-detail asset;
- отсутствие inline CSS;
- отсутствие исполняемого inline JavaScript;
- допустимость JSON-LD;
- наличие нужного preset в `public-lead-form.js`;
- canonical, форму, телефон, privacy-ссылку и локальные ссылки.

## Supabase read-only snapshot

На момент миграции:

- production project: `ACTIVE_HEALTHY`;
- `leader-public-lead`: ACTIVE, версия 10;
- `leader_leads`: 12;
- заявок с `request_id`: 1;
- последний lead: 2026-07-01 14:20:01 UTC;
- заявок с двух изменяемых страниц: 0.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, grants, Auth, Edge Functions и данные;
- публичная форма и её endpoint;
- цены, обещания и контактные данные.
