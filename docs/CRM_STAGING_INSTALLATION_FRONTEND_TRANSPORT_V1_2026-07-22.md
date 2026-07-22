# Staging frontend transport монтажа v3

Дата: 22 июля 2026 года.

## Результат

Рабочая карточка `installation-job-card-v2.js` использует защищённый `leader-crm-installation v2` только при exact staging URL.

Подтверждены два уровня runtime-проверки:

- user-JWT API smoke;
- authenticated UI smoke в реальном headless Google Chrome.

Production продолжает существующий браузерный путь и не переключался на новый Edge.

## Маршрутизация

`installation-job-save-route-v1.js`:

- `https://otulfnouybahfnsycxqn.supabase.co` → `staging_edge`;
- любой другой URL → `production_locked` для нового Edge-маршрута;
- похожие поддомены не считаются staging.

Рабочий `config.js` остаётся подключён к production `ofewxuqfjhamgerwzull.supabase.co`, поэтому существующий production fallback сохранён.

## Staging read

`installation-job-staging-read-transport-v1.js`:

1. Проверяет exact staging hostname.
2. Получает текущую user session.
3. Вызывает `leader-crm-installation` с `installation_job.read`.
4. Сервер проверяет `installation.read`.
5. Возвращает privacy-safe bundle.

Browser `.from()`, `.select()` и `.rpc()` в staging read path отсутствуют.

Не возвращаются:

- контакты клиента;
- финансовые поля;
- internal comments;
- `order.data`;
- server-owned actor fields.

## Staging write

`installation-job-staging-transport-v1.js`:

1. Проверяет exact staging hostname.
2. Получает user JWT.
3. Формирует allowlisted `installation_job.update`.
4. Передаёт `request_id`, `expected_updated_at` и `idempotency_key`.
5. Выполняет одну атомарную Edge-команду.
6. После успеха перечитывает карточку через Edge read.

Allowlist:

- `title`;
- `install_status`;
- `installer_name`;
- `installer_phone`;
- `address`;
- `scheduled_at`;
- `before_photo_url`;
- `after_photo_url`;
- `technical_task`;
- `tools_required`;
- `installer_comment`.

Server-owned поля в staging command не включаются.

## Точность optimistic timestamp

Authenticated UI smoke обнаружил ложный `409 conflict`.

Причина: `updated_at` PostgreSQL с микросекундами преобразовывался через JavaScript `Date.toISOString()`, который сохраняет только миллисекунды.

Transport теперь:

- валидирует `expected_updated_at`;
- передаёт исходную точную строку без нормализации;
- сохраняет микросекунды PostgreSQL;
- не ослабляет server-side optimistic concurrency.

Regression test использует:

`2026-07-21T20:00:00.123456+00:00`

и требует полного совпадения `command.expected_updated_at`.

## Карточка

Exact staging:

- read через Edge;
- write через одну атомарную Edge-команду;
- прямые browser writes отсутствуют;
- финансовые поля скрыты;
- comments read-only;
- server read-back после сохранения;
- staging Edge notice виден пользователю.

Production:

- существующие direct browser reads/writes сохранены;
- новый production Edge route заблокирован;
- production Supabase и данные не менялись.

## Authenticated browser smoke

GitHub Actions run `29956544804` успешно выполнил:

- временный Auth user;
- роль `installer`;
- вход через Supabase Auth;
- открытие реальной карточки;
- privacy checks;
- ровно одну update-мутацию;
- server read-back;
- проверку изменённого title;
- cleanup Auth user и всех synthetic rows.

Runtime evidence:

`contracts/crm-staging-installation-ui-smoke-v1.json`

Postflight после smoke — все счётчики `0`.

## Проверки

- `tools/test_installation_job_save_route.mjs`;
- `tools/test_installation_job_staging_transport.mjs`;
- `tools/test_installation_job_staging_read_transport.mjs`;
- `tools/test_crm_staging_installation_ui_smoke.mjs`;
- `tools/check_crm_staging_installation_frontend_transport.py`;
- `tools/check_crm_staging_installation_ui_smoke.py`;
- `.github/workflows/crm-staging-installation-frontend-transport-check.yml`;
- `.github/workflows/crm-staging-installation-ui-smoke-check.yml`.

## Текущий gate

Staging read/write и authenticated browser UI smoke завершены.

Следующий шаг — только отдельный production rollout с явным согласованием, production backend deployment, rollback plan и отдельной production-проверкой.

Production не изменялся.
