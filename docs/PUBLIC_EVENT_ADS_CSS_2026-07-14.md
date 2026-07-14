# Публичный сайт: CSS страницы рекламы мероприятий

Дата: 2026-07-14.

Контур: только публичный сайт.

## Изменение

Стили страницы `reklama-dlya-meropriyatiy-borisoglebsk.html` вынесены из inline `<style>` в кешируемый файл:

- `assets/public-event-ads.css?v=1`.

## Сохранённый контракт

- шесть типов мероприятий и переездного бизнеса;
- шесть рекламных услуг;
- быстрый и усиленный стартовые комплекты;
- два информационных блока для расчёта;
- четыре этапа работы;
- Service JSON-LD;
- форма `public-lead-form` v16;
- canonical, robots, Open Graph и телефон;
- отсутствие executable inline JavaScript.

## Проверка

Добавлены:

- `tools/check_public_event_ads_css.py`;
- `.github/workflows/public-event-ads-css-check.yml`.

Checker проверяет порядок таблиц стилей, клиентские сценарии, форму, structured data, ключевые CSS-селекторы и мобильный breakpoint.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-данные.
