# Публичный сайт РА «Лидер»: CSS страницы рекламы для бизнеса

Дата: 2026-07-13.

Контур: только публичный сайт.

## Изменение

Стили страницы `reklama-dlya-biznesa.html` перенесены из inline `<style>` в отдельный кешируемый файл:

- `assets/public-business-advertising.css?v=1`.

## Что сохранено

- шесть сценариев бизнеса;
- четыре этапа подбора рекламы;
- Service, WebPage, LocalBusiness и BreadcrumbList JSON-LD;
- Open Graph и Twitter metadata;
- canonical и robots;
- форма `public-lead-form.js?v=9`;
- общие стили формы `public-lead-form.css?v=8`;
- телефон и CTA;
- адаптивный breakpoint 900 px.

## Порядок CSS

1. `assets/public-lead-form.css?v=8`;
2. `assets/public-business-advertising.css?v=1`.

Это сохраняет прежний каскад: page-specific оформление загружается после общей формы.

## Проверка

Добавлены:

- `tools/check_public_business_advertising_css.py`;
- `.github/workflows/public-business-advertising-css-check.yml`.

Контракт запрещает возврат inline `<style>`, проверяет шесть `data-scenario`, четыре этапа, structured data, форму и ключевые CSS-селекторы.

## Не изменено

- клиентский текст;
- цены и коммерческие обещания;
- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth, Edge Functions и production data.
