# Миграция CSS страницы подготовки расчёта

Дата: 2026-07-13

## Цель

Перенести большой встроенный CSS страницы `chto-nuzhno-dlya-rascheta.html` в отдельный кешируемый файл без изменения клиентского текста, дизайна, SEO, HowTo-разметки, service-prefill и формы заявки.

## Итоговая схема

- `assets/public-lead-form.css?v=13` — общие стили формы;
- `assets/public-calculation-checklist.css?v=1` — стили страницы чек-листа;
- `assets/public-lead-form.js?v=13` — логика формы.

## Сохранённые элементы

- H1 и вводный чек-лист;
- карточки баннеров, наклеек, табличек, вывесок, витрин, дизайна, соцсетей и карт;
- примеры заявок;
- `data-service` для подстановки услуг;
- HowTo JSON-LD;
- полезные ссылки;
- форма с `id="leader-lead-form"`.

## Контракт

`tools/check_public_calculation_checklist_css.py` проверяет:

- отсутствие inline `<style>`;
- наличие и порядок двух CSS-файлов;
- сохранение form JS v13;
- обязательные клиентские и structured-data маркеры;
- основные CSS-компоненты и мобильный breakpoint;
- отсутствие удалённых CSS-ресурсов.

## Границы

CRM UI, `nav_*`, `nav_v2_*`, Supabase schema, RLS, Auth, Edge Functions и production data не меняются.
