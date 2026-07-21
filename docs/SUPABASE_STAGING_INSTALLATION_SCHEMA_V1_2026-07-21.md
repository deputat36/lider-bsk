# Staging installation schema v2

Дата аудита и синхронизации: 21 июля 2026 года.

## Назначение

Зафиксировать production-compatible синтетическую схему монтажа и фактически развёрнутый staging-контур `installation_job.update`.

Production проект исследован только read-only. В рамках текущей синхронизации новые миграции и Edge Functions не применялись: staging deployment уже существовал параллельно до фиксации evidence в GitHub. Production не изменялся.

## Контуры

- staging: `otulfnouybahfnsycxqn`;
- production read-only baseline: `ofewxuqfjhamgerwzull`;
- repository: `deputat36/lider-bsk`.

## Исторический staging gap

До deployment в staging отсутствовали:

- `leader_installation_jobs`;
- `leader_installation_events`;
- `leader_installation_comments`.

В `leader_orders` отсутствовали:

- `installation_address`;
- `installation_scheduled_at`;
- `installation_completed_at`;
- `installer_name`;
- `installer_phone`.

Поля `installation_status`, `current_stage`, `updated_at` и `stage_updated_at` уже существовали.

## Текущее staging-состояние

Read-only postflight подтвердил:

- все три installation-таблицы существуют;
- все шесть монтажных полей заказа существуют;
- `leader_installation_jobs`: 0 строк;
- `leader_installation_events`: 0 строк;
- `leader_installation_comments`: 0 строк;
- receipts для `installation_job.update`: 0;
- RLS включён;
- browser policies отсутствуют;
- `public`, `anon`, `authenticated` не имеют доступа к таблицам;
- `service_role` имеет только необходимый SELECT/INSERT/UPDATE набор.

Журнал миграций содержит:

- version: `20260721191810`;
- name: `staging_installation_job_update_rpc_20260721`.

## Production baseline

Read-only аудит подтвердил:

- `leader_installation_jobs`: 30 полей;
- `leader_installation_events`: 9 полей;
- `leader_installation_comments`: 7 полей;
- 7 прикладных индексов плюс первичные ключи;
- FK job → order с `ON DELETE SET NULL`;
- FK job → production job с `ON DELETE SET NULL`;
- FK event/comment → installation job с `ON DELETE CASCADE`;
- специальных installation-триггеров нет;
- специальных installation-RPC в production нет;
- связанный заказ содержит `installation_completed_at` наряду с остальными монтажными полями.

Production RLS допускает активных authenticated-пользователей. В staging этот browser-доступ намеренно не копируется: контур остаётся service-role-only за JWT-first Edge.

## Canonical schema source

`supabase/staging-migrations/20260721_05_installation_schema_install.sql`

Источник:

1. Проверяет точный `leader_staging.environment_guard`.
2. Проверяет наличие orders, production jobs и user profiles.
3. Добавляет пять недостающих полей заказа, включая `installation_completed_at`.
4. Создаёт три installation-таблицы по production-compatible структуре.
5. Создаёт FK и индексы.
6. Включает RLS.
7. Отзывает все table privileges у `public`, `anon`, `authenticated`.
8. Даёт минимальные права только `service_role`.

Источник не создаёт browser policies.

## Schema acceptance

`supabase/staging-tests/20260721_installation_schema_acceptance.sql`

Тест:

- начинается с `BEGIN`;
- повторно проверяет environment guard;
- создаёт только синтетические order, production job, installation job, event и comment;
- проверяет связи и каскадное удаление дочерних строк;
- проверяет закрытые browser grants;
- проверяет минимальные service-role grants;
- всегда заканчивается `ROLLBACK`.

После теста fixture-данные отсутствуют.

## Атомарная команда

В staging развёрнуты:

- `public.leader_update_installation_job_rpc(jsonb)`;
- четыре закрытые helper-функции в `leader_private`;
- JWT-first Edge `leader-crm-installation v1`.

RPC:

- SECURITY INVOKER;
- `search_path=''`;
- доступен только `service_role`;
- проверяет `installation.write`;
- использует `request_id`, `idempotency_key`, `expected_updated_at`;
- блокирует installation job и связанный order;
- атомарно обновляет job, order, event и receipt;
- обновляет `installation_completed_at` при завершении;
- возвращает безопасную проекцию.

Подробный deployment evidence хранится отдельно:

`contracts/crm-staging-installation-command-edge-v1.json`

## Статусы

Источник истины:

`crm/v4/assets/v4/status-transitions-v1.js`

Canonical installation statuses:

- `Не назначен`;
- `Запланирован`;
- `Перенесён`;
- `В работе`;
- `Выполнен`;
- `Не требуется`;
- `Отменён`.

Production default `Нужно назначить` сохраняется как legacy alias для `Не назначен`.

## Автоматическая проверка схемы

Контракт:

`contracts/crm-staging-installation-schema-v1.json`

Checker:

`tools/check_crm_staging_installation_schema.py`

Workflow:

`.github/workflows/crm-staging-installation-schema-check.yml`

CI проверяет:

- exact staging guard;
- production-compatible columns, FK и indexes;
- обязательное поле `installation_completed_at`;
- RLS и закрытые browser grants;
- service-role-only access;
- rollback-safe acceptance;
- совпадение со статусным registry;
- точные fingerprints installation RPC/helpers;
- отсутствие секретов;
- явную границу production.

## Следующий этап

1. Синхронизировать deployed Edge/RPC source и hash с GitHub.
2. Выполнить authenticated user-JWT smoke без постоянных fixture-пользователей.
3. Подготовить staging-only переключение `installation-job-card-v2.js` с трёх browser writes на одну Edge-команду.
4. Проверить optimistic concurrency, idempotent replay и rollback UI.
5. Production rollout согласовывать отдельно.

## Граница

В текущей синхронизации не выполняются:

- новый Supabase migration apply;
- новый Edge deploy;
- frontend switch;
- production migration или Edge deploy;
- production RLS/grants;
- Auth, Storage или secrets;
- изменения `nav_*`;
- изменения рабочих данных.
