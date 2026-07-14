# Публичный сайт: CSS страницы рекламы в соцсетях

Дата: 2026-07-14.

Контур: только публичный сайт.

## Изменение

Стили страницы `reklama-v-socsetyah-borisoglebsk.html` вынесены из inline `<style>` в кешируемый файл:

- `assets/public-social-ads.css?v=1`.

## Сохранённый контракт

- шесть типов клиентов;
- шесть составляющих услуги;
- три популярных рекламных формата;
- четыре шага подготовки заявки;
- Service JSON-LD;
- форма `public-lead-form` v17;
- mobile sticky CTA;
- canonical, robots, Open Graph и телефон;
- отсутствие executable inline JavaScript.

## Проверка

Добавлены:

- `tools/check_public_social_ads_css.py`;
- `.github/workflows/public-social-ads-css-check.yml`.

Checker проверяет порядок таблиц стилей, клиентские блоки, форму, structured data, ключевые CSS-селекторы и мобильный breakpoint.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-данные.
