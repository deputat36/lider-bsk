# Staging installation schema v1

Дата аудита и подготовки: 21 июля 2026 года.

## Назначение

Подготовить production-compatible синтетическую схему монтажа в отдельном staging-проекте, прежде чем создавать атомарную команду `installation_job.update`.

Production проект исследован только read-only. Миграция из этого PR не применялась. Production не изменялся.

## Контуры

- staging: `otulfnouybahfnsycxqn`;
- production read-only baseline: `ofewxuqfjhamgerwzull`;
- repository: `deputat36/lider-bsk`.

## Найденный staging gap

До миграции в staging отсутствуют:

- `leader_installation_jobs`;
- `leader_installation_events`;
- `leader_installation_comments`.

В `leader_orders` отсутствуют:

- `installation_address`;
- `installation_scheduled_at`;
- `installer_name`;
- `installer_phone`.

Поля `installation_status`, `current_stage`, `updated_at` и `stage_updated_at` уже существуют.

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
- специальных installation-RPC в production нет.

Production RLS допускает активных authenticated-пользователей. В staging этот доступ намеренно не копируется: синтетический контур остаётся service-role-only до появления JWT-first Edge и атомарного RPC.

## Миграция

`supabase/staging-migrations/20260721_05_installation_schema_install.sql`

Миграция:

1. Проверяет точный `leader_staging.environment_guard`.
2. Проверяет наличие orders, production jobs и user profiles.
3. Добавляет четыре недостающих поля заказа.
4. Создаёт три installation-таблицы по production-compatible структуре.
5. Создаёт FK и индексы.
6. Включает RLS.
7. Отзывает все table privileges у `public`, `anon`, `authenticated`.
8. Даёт минимальные права только `service_role`.

Миграция не создаёт browser policies.

## Acceptance

`supabase/staging-tests/20260721_installation_schema_acceptance.sql`

Тест:

- начинается с `BEGIN`;
- повторно проверяет environment guard;
- создаёт только синтетические order, production job, installation job, event и comment;
- проверяет связи и каскадное удаление дочерних строк;
- проверяет закрытые browser grants;
- проверяет минимальные service-role grants;
- всегда заканчивается `ROLLBACK`.

После теста не должны оставаться fixture-данные.

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

## Автоматическая проверка

Контракт:

`contracts/crm-staging-installation-schema-v1.json`

Checker:

`tools/check_crm_staging_installation_schema.py`

Workflow:

`.github/workflows/crm-staging-installation-schema-check.yml`

CI проверяет:

- exact staging guard;
- production-compatible columns, FK и indexes;
- RLS и закрытые browser grants;
- service-role-only access;
- rollback-safe acceptance;
- совпадение со статусным registry;
- отсутствие секретов;
- отсутствие `leader_update_installation_job_rpc`, Edge deploy и frontend switch в этом этапе.

## Следующий этап

После отдельного разрешения на staging-изменение:

1. применить миграцию только к `otulfnouybahfnsycxqn`;
2. выполнить acceptance и postflight;
3. убедиться, что fixture rows = 0;
4. проверить security/performance advisors;
5. только затем проектировать `leader_update_installation_job_rpc`;
6. после RPC создать JWT-first `leader-crm-installation` Edge;
7. отдельно переключить staging frontend.

## Граница

В этом этапе не выполняются:

- Supabase migration apply;
- DDL/DML в staging или production;
- `leader_update_installation_job_rpc`;
- installation Edge deploy;
- frontend switch;
- production RLS/grants;
- Auth, Storage или secrets;
- изменения `nav_*`;
- изменения рабочих данных.
