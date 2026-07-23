# Authenticated staging UI smoke карточки монтажа v2

Дата: 22 июля 2026 года.

## Результат

Реальная `crm/v4/assets/v4/installation-job-card-v2.js` успешно проверена в headless Google Chrome с настоящей staging-сессией пользователя.

GitHub Actions run: `29956544804`.

Подтверждено:

- вход временного пользователя через Supabase Auth;
- открытие реальной карточки, а не тестовой копии логики;
- `installation_job.read` через `leader-crm-installation v2`;
- staging Edge notice в интерфейсе;
- privacy-safe projection без клиентских контактов и финансов;
- комментарии только для чтения;
- ровно одна `installation_job.update`-мутация;
- атомарное сохранение через Edge;
- server read-back после сохранения;
- новое название отображается после перерисовки;
- локальный logout;
- удаление Auth user, профиля, заказа, производства, монтажа, позиций, событий, комментариев и receipt.

Итог workflow — success, все шаги включая cleanup завершены успешно.

## Реальный пользовательский путь

Runner `tools/run_crm_staging_installation_ui_smoke.mjs`:

1. Проверил exact staging URL `https://otulfnouybahfnsycxqn.supabase.co`.
2. Скопировал `crm/v4` в системную временную директорию.
3. Изменил `config.js` только во временной копии.
4. Запустил локальный сервер на `127.0.0.1`.
5. Открыл страницу настоящим headless Chrome.
6. Выполнил `signInWithPassword` временного staging-пользователя.
7. Нажал реальную кнопку открытия монтажной карточки.
8. Дождался safe Edge projection.
9. Проверил отсутствие финансов и write-control для комментариев.
10. Изменил только название задания.
11. Нажал реальную кнопку сохранения.
12. Получил успешный server read-back.
13. Проверил изменённое название после перерисовки.
14. Выполнил локальный logout.
15. Удалил временную директорию в `finally`.

Автоматический screenshot-run был отключён, чтобы не открыть страницу второй раз и не создать вторую мутацию.

## Найденная ошибка optimistic concurrency

Первая browser-попытка получила корректный `409 conflict`.

Причина была не на сервере. Transport выполнял:

`new Date(expectedUpdatedAt).toISOString()`

PostgreSQL возвращал `updated_at` с микросекундами, например:

`2026-07-21T20:00:00.123456+00:00`

JavaScript `Date` сохраняет только миллисекунды. После нормализации значение становилось другим, и сервер справедливо отклонял stale timestamp.

Исправление:

- timestamp по-прежнему валидируется через `Date.parse`;
- в `expected_updated_at` отправляется исходная точная PostgreSQL-строка;
- unit-тест фиксирует строку с шестью знаками микросекунд;
- серверная optimistic-concurrency защита не ослаблялась.

Файлы:

- `crm/v4/assets/v4/installation-job-staging-transport-v1.js`;
- `tools/test_installation_job_staging_transport.mjs`.

## OIDC fixture lifecycle

Текущая execution-среда не имела внешнего DNS для локального Chrome. Вместо ослабления staging Auth использован GitHub Actions OIDC.

Workflow:

`.github/workflows/crm-staging-installation-authenticated-ui-smoke-runtime.yml`

Он имеет только:

- `contents: read`;
- `id-token: write`.

GitHub Secrets не использовались.

Временный Edge bootstrap проверял подпись GitHub OIDC и точные claims:

- issuer;
- custom audience;
- repository и repository ID;
- repository owner ID;
- actor ID;
- branch ref;
- workflow ref;
- push event;
- GitHub-hosted runner;
- public repository visibility;
- subject.

Runtime source:

`supabase/staging-functions/leader-staging-installation-ui-smoke-bootstrap/oidc-runtime.ts`

После завершения bootstrap заменён permanently locked версией:

- version `3`;
- `verify_jwt=true`;
- HTTP `410`;
- SHA-256 `a6aff37145a1fd89fc94bfba2b8a7b27ecacf6eaa087ff6d4720f6d53b63cc7f`.

Locked source:

`supabase/staging-functions/leader-staging-installation-ui-smoke-bootstrap/index.ts`

## Server-side fixture harness

Временно применялись staging migrations:

- `20260722203019` — state-table;
- `20260722203052` — prepare RPC;
- `20260722203119` — cleanup RPC;
- `20260722203204` — inspect RPC.

RPC были доступны только `service_role`. Browser roles не получили доступ к fixture lifecycle.

После успешного smoke применена migration:

`20260722204939 / staging_installation_ui_smoke_harness_cleanup_20260722`

Она удаляет:

- prepare RPC;
- inspect RPC;
- cleanup RPC;
- state-table.

Cleanup migration предварительно требует полностью пустой staging-контур.

## Evidence

Privacy-safe artifact:

- artifact ID `8544259027`;
- digest `sha256:e9e23e5fa822c71ac0bbd5f2b900e162835ec815cb79f2ff4e1c30c51c3d89f9`;
- retention — 7 дней.

Evidence содержит только:

- `status=passed`;
- project ref;
- имя карточки;
- факт авторизации;
- безопасную роль;
- факт Edge notice;
- privacy projection;
- факт Edge update;
- server read-back;
- факт изменения title;
- `mutation_count=1`;
- результаты локальной и внешней очистки.

Email, пароль, JWT, Authorization, API keys, телефоны, клиентские данные, цены, прибыль и комментарии в evidence отсутствуют.

## Финальный postflight

После cleanup:

- Auth users: `0`;
- profiles: `0`;
- orders: `0`;
- production jobs: `0`;
- installation jobs: `0`;
- items: `0`;
- events: `0`;
- comments: `0`;
- installation command receipts: `0`;
- smoke state rows: `0`;
- temporary fixture RPC/table: отсутствуют.

Все счётчики `0`, временные Auth-пользователи, fixtures, receipts и server-side harness удалены.

RPC fingerprints:

- read: `5a353818606012d0e657a83f133723b6`, `5432` bytes;
- write: `0ed4669197dac1f2695d0eec54e1`, `19061` bytes.

Security и performance advisors не добавили новых ERROR/WARN. Остались только ранее ожидаемые INFO закрытого staging harness и unused indexes пустого контура.

## Production boundary

Production `ofewxuqfjhamgerwzull` не изменялся:

- DDL/DML не выполнялись;
- Edge Functions не разворачивались;
- Auth, RLS, grants и Storage не менялись;
- frontend production не переключался;
- рабочие данные и `nav_*` не затрагивались.

Production rollout по-прежнему требует отдельного явного согласования.
