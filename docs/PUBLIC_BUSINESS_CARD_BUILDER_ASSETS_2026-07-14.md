# Конструктор визиток: внешние assets

Дата: 14 июля 2026 года.

## Цель

Убрать executable inline JavaScript, inline CSS и style-атрибуты со страницы `vizitki-borisoglebsk.html`, сохранив поведение конструктора заказа и форму публичной заявки.

## Реализация

- стили вынесены в `assets/public-business-card-builder.css?v=1`;
- логика конструктора вынесена в `assets/public-business-card-builder.js?v=1`;
- сохранены `public-lead-form.js?v=5` и `public-related-services.js?v=1`;
- сохранены восемь параметров заказа: вид, формат, стороны печати, тираж, бумага, ламинация, скругление углов и дизайн;
- кнопка «Перенести в заявку» по-прежнему выбирает услугу «Визитки», переносит итоговое описание и прокручивает к форме;
- ссылки на главную страницу услуг и телефон переведены со style-атрибутов на CSS-классы.

## Доступность

- каждый `label` связан с соответствующим `select` через `for` и `id`;
- итоговое описание имеет `aria-live="polite"`;
- кнопка переноса остаётся обычной кнопкой `type="button"` и не отправляет форму самостоятельно.

## Постоянный контракт

`tools/check_public_business_card_builder_assets.py` и workflow `Public business card builder assets check` проверяют:

- отсутствие inline CSS, style-атрибутов и executable inline JavaScript;
- порядок CSS и JavaScript assets;
- наличие восьми полей и их label-связей;
- сохранность H1, CTA, canonical, телефона и контейнера формы;
- ключевые строки итогового описания;
- перенос услуги и сообщения в общую форму;
- синтаксис JavaScript через `node --check`.

## Границы

CRM UI, `nav_*`, Supabase schema, RLS, Auth, Edge Functions и production-данные не изменялись.
