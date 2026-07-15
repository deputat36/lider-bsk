# Публичный сайт РА «Лидер»: общий CSS для страниц оформления входа

Дата: 2026-07-15.

Контур: только публичный сайт.

## Страницы

- `oformlenie-vhoda-borisoglebsk.html`;
- `nakleyki-na-vitrinu-borisoglebsk.html`;
- `rezhim-raboty-tablichki-borisoglebsk.html`.

## Что изменено

Три родственные страницы использовали одинаковые встроенные стили для:

- верхней контактной панели;
- sticky header;
- hero-блока;
- карточек и списков;
- FAQ;
- смежных ссылок;
- footer;
- мобильных breakpoint 920 и 560 px.

Повторяющиеся стили перенесены в кешируемый файл:

- `assets/public-entry-detail.css?v=1`.

Страницы продолжают подключать базовые файлы в порядке:

1. `assets/public-landing.css?v=1`;
2. `assets/public-lead-form.css?v=4`;
3. `assets/public-entry-detail.css?v=1`.

## Визуальные варианты

Исходные различия сохранены через body-классы:

- `page-entrance-detail`;
- `page-window-stickers-detail`;
- `page-working-hours-detail`.

Для страницы оформления входа отдельно сохранены:

- пропорция hero-сетки `1.04fr / .96fr`;
- ширина заголовочного блока 820 px;
- тень акцентной кнопки;
- четырёхэтапный блок заказа и его мобильное представление.

Для страниц оформления входа и витринных наклеек сохранён декоративный элемент hero. На странице режима работы он не добавляется.

## Что сохранено

- клиентские тексты;
- цены и коммерческие формулировки;
- title, description и canonical;
- Open Graph и Twitter Card;
- Service JSON-LD;
- телефон;
- CTA и `data-service`;
- форма `public-lead-form.js?v=5`;
- существующие page preset в общей форме;
- локальные ссылки и политика обработки данных.

## Постоянная защита

Обновлены:

- `tools/check_public_entrance_migration.py`;
- `tools/check_public_window_stickers_migration.py`;
- `tools/check_public_working_hours_migration.py`;
- `.github/workflows/public-entrance-migration-check.yml`;
- `.github/workflows/public-window-stickers-migration-check.yml`;
- `.github/workflows/public-working-hours-migration-check.yml`.

Контракты требуют:

- три stylesheet в правильном порядке;
- правильный body-класс;
- отсутствие inline CSS;
- отсутствие исполняемого inline JavaScript;
- сохранение JSON-LD;
- наличие централизованного preset;
- сохранение SEO, формы, телефона, privacy и локальных ссылок.

## Supabase read-only snapshot

На момент подготовки:

- production project: `ACTIVE_HEALTHY`;
- `leader-public-lead`: ACTIVE, версия 10;
- `leader_leads`: 12;
- заявок с трёх изменяемых страниц: 0;
- последняя заявка: 2026-07-01 14:20:01 UTC.

Production Supabase не изменялся.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, grants, Auth и Edge Functions;
- production-данные;
- содержание услуг и коммерческие обещания.
