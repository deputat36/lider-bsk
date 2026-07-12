# Публичная заявка: вынос CSS и форма v5

Дата: 2026-07-12.

Scope: public site only.

Related issues: #185, #191.

## Цель

Завершить переход публичных страниц на общую форму `v=5`, сохранив специальную логику стабильного `request_id` на `request.html`.

## Изменения страницы

- единственный inline `<style>` извлекается без изменения CSS-правил в `assets/public-request.css`;
- сохраняется исходный каскад: сначала `assets/public-lead-form.css?v=4`, затем request CSS;
- `assets/public-lead-form.js?v=4` обновляется до `v=5`;
- `assets/public-lead-reference-v1.js?v=1` остаётся перед form script;
- source-level CRM-фразы удаляются из meta description и первого экрана;
- вместо них используется клиентское обещание номера обращения после отправки.

## Почему важен script order

`public-lead-reference-v1.js` оборачивает `window.fetch` до инициализации формы. Это позволяет повторной отправке использовать тот же `request_id`, если предыдущий ответ не был получен клиентом. Поэтому helper должен загружаться раньше `public-lead-form.js`.

## Постоянная защита

Добавляются:

- `tools/check_public_request_css_v5.py`;
- `.github/workflows/public-request-css-v5-check.yml`.

Контракт проверяет:

- отсутствие inline CSS и CRM-фраз;
- полноту `assets/public-request.css`;
- порядок form CSS → request CSS;
- порядок reference helper → form `v=5`;
- один H1 и одну точку монтирования формы;
- шесть обязательных сценариев;
- блоки «Что будет дальше», «Перед отправкой» и «После отправки»;
- canonical, Open Graph и номер обращения.

## Синхронизация CI

Обновляются только публичные ожидания в:

- `request-reference-check.yml`;
- `public-request-seo-check.yml`;
- `public-site-audit-check.yml`;
- public lead section в `static-checks.yml`.

После этапа `v=4` считается устаревшей версией для всех публичных HTML-страниц.

## Supabase

Supabase production не изменяется. Страница продолжает отправлять обращения в активную `leader-public-lead v10`, `verify_jwt=false`.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Edge Functions, migrations, schema, RLS, grants, policies, Auth и данные;
- сценарии формы, тексты клиента, цены и бизнес-логика заявки.
