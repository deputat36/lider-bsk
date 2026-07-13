# Внешние assets страницы «Как проходит заказ»

Дата: 2026-07-13

## Цель

Убрать со страницы `kak-prohodit-zakaz.html` встроенный CSS и executable inline JavaScript без изменения дизайна, клиентского текста, HowTo JSON-LD, порядка этапов или поведения формы.

## Итоговая схема

- `assets/public-landing.css?v=1` — общий каркас посадочных страниц;
- `assets/public-lead-form.css?v=4` — стили формы;
- `assets/public-order-process.css?v=1` — стили страницы процесса;
- `assets/public-lead-form.js?v=5` — общая логика формы;
- `assets/public-order-process.js?v=1` — подстановка контекста страницы в пустое поле сообщения.

## Сохранённые элементы

- восемь этапов заказа;
- номер обращения после отправки;
- три подготовительных чек-листа;
- блок факторов стоимости;
- HowTo JSON-LD;
- форма и ссылки на расчёт и контакты;
- точный preset: `Страница «Как проходит заказ». Нужна консультация и расчёт рекламной задачи.`

## Контракт

`tools/check_public_order_process_assets.py` проверяет:

- отсутствие inline `<style>` и executable inline `<script>`;
- точный порядок CSS и JavaScript;
- сохранение формы и HowTo-разметки;
- наличие всех ключевых CSS-компонентов;
- наличие и точность form-preset во внешнем JS;
- отсутствие дублирования preset в HTML.

Workflow дополнительно запускает `node --check` для внешнего JavaScript.

## Границы

CRM UI, `nav_*`, `nav_v2_*`, Supabase schema, RLS, Auth, Edge Functions и production data не меняются.
