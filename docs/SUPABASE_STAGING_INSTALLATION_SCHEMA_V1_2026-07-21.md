# Staging installation schema v3

Дата аудита и синхронизации: 21 июля 2026 года.

## Назначение

Зафиксировать полный production-compatible контур монтажа из четырёх таблиц, фактически развёрнутую staging-команду `installation_job.update` и известные расхождения схемы.

Production проект исследован только read-only. В рамках текущей синхронизации новые миграции и Edge Functions не применялись: staging deployment уже существовал до фиксации evidence в GitHub. Production не изменялся.

## Контуры

- staging: `otulfnouybahfnsycxqn`;
- production read-only baseline: `ofewxuqfjhamgerwzull`;
- repository: `deputat36/lider-bsk`.

## Production baseline

Read-only аудит подтвердил четыре таблицы:

- `leader_installation_jobs`: 30 полей;
- `leader_installation_job_items`: 12 полей;
- `leader_installation_events`: 9 полей;
- `leader_installation_comments`: 7 полей.

Production FK:

- jobs → order: `ON DELETE SET NULL`;
- jobs → production job: `ON DELETE SET NULL`;
- items → job: `ON DELETE CASCADE`;
- items → order: `ON DELETE SET NULL`;
- events → job: `ON DELETE CASCADE`;
- events → order: `ON DELETE SET NULL`;
- comments → job: `ON DELETE CASCADE`.

Production содержит девять прикладных индексов, включая покрывающие индексы для всех FK.

Связанный заказ содержит:

- `installation_status`;
- `installation_address`;
- `installation_scheduled_at`;
- `installation_completed_at`;
- `installer_name`;
- `installer_phone`;
- `current_stage`;
- `updated_at`;
- `stage_updated_at`.

Специальных installation-триггеров и installation-RPC в production нет.

## Исторический staging gap

До deployment в staging отсутствовали все четыре installation-таблицы и пять дополнительных полей заказа:

- `installation_address`;
- `installation_scheduled_at`;
- `installation_completed_at`;
- `installer_name`;
- `installer_phone`.

## Текущее staging-состояние

Read-only postflight подтвердил:

- все четыре installation-таблицы существуют;
- все монтажные поля заказа существуют;
- jobs/items/events/comments: по `0` строк;
- receipts для `installation_job.update`: `0`;
- RLS включён;
- browser policies отсутствуют;
- `public`, `anon`, `authenticated` не имеют table privileges;
- `service_role` имеет минимальные права.

Журнал миграций содержит:

- version: `20260721191810`;
- name: `staging_installation_job_update_rpc_20260721`.

## Известный deployed schema drift

Фактически развёрнутый staging не полностью совпадает с production baseline.

Три FK используют `ON DELETE CASCADE` вместо production `ON DELETE SET NULL`:

- `leader_installation_jobs.order_id`;
- `leader_installation_job_items.order_id`;
- `leader_installation_events.order_id`.

Отсутствуют два покрывающих индекса:

- `leader_installation_job_items_order_id_idx`;
- `leader_installation_events_order_id_idx`.

Performance Advisor подтверждает оба отсутствующих FK-индекса. Это INFO-level performance drift, а не подтверждённая утечка данных.

Reconciliation требуется, но в текущем цикле DDL не выполнялся. Изменять FK и индексы следует отдельной staging-миграцией с preflight, rollback и проверкой отсутствия fixture-данных.

## Canonical schema source

`supabase/staging-migrations/20260721_05_installation_schema_install.sql`

Canonical source:

1. Проверяет точный `leader_staging.environment_guard`.
2. Добавляет пять полей заказа, включая `installation_completed_at`.
3. Создаёт jobs, job items, events и comments.
4. Использует production-семантику `order_id ON DELETE SET NULL`.
5. Создаёт все девять production-compatible индексов.
6. Включает RLS.
7. Закрывает table privileges для `public`, `anon`, `authenticated`.
8. Даёт минимальные права только `service_role`.

Этот source является целевым clean-staging baseline. Он не означает, что drift уже исправлен в действующей базе.

## Schema acceptance

`supabase/staging-tests/20260721_installation_schema_acceptance.sql`

Rollback-safe тест создаёт synthetic:

- order;
- production job;
- installation job;
- installation job item;
- installation event;
- installation comment.

Тест проверяет FK, каскад job → children, browser grants и service-role grants, затем всегда выполняет `ROLLBACK`.

## Атомарная команда

В staging развёрнуты:

- `public.leader_update_installation_job_rpc(jsonb)`;
- четыре helper-функции в `leader_private`;
- JWT-first Edge `leader-crm-installation v1`.

RPC:

- SECURITY INVOKER;
- `search_path=''`;
- доступен только `service_role`;
- повторно проверяет `installation.write`;
- использует `request_id`, `idempotency_key`, `expected_updated_at`;
- блокирует job и linked order;
- атомарно обновляет job, order, event и receipt;
- синхронизирует `installation_completed_at`;
- возвращает safe response.

Deployment evidence:

`contracts/crm-staging-installation-command-edge-v1.json`

## Статусы

Источник истины:

`crm/v4/assets/v4/status-transitions-v1.js`

Canonical statuses:

- `Не назначен`;
- `Запланирован`;
- `Перенесён`;
- `В работе`;
- `Выполнен`;
- `Не требуется`;
- `Отменён`.

`Нужно назначить` сохраняется как legacy alias для `Не назначен`.

## Автоматическая проверка

Schema contract:

`contracts/crm-staging-installation-schema-v1.json`

Schema checker:

`tools/check_crm_staging_installation_schema.py`

Schema workflow:

`.github/workflows/crm-staging-installation-schema-check.yml`

CI проверяет:

- полный набор из четырёх таблиц;
- production-compatible FK/index target;
- `installation_completed_at`;
- deployed drift inventory;
- нулевые fixture counts;
- service-role-only access;
- rollback-safe acceptance;
- RPC fingerprints;
- статусный registry;
- production boundary.

## Следующие этапы

1. Зафиксировать Edge/RPC deployment evidence в `main`.
2. Создать отдельную staging reconciliation migration для трёх FK и двух индексов.
3. Выполнить preflight: installation rows и receipts должны быть `0` либо иметь подтверждённый migration plan.
4. Выполнить rollback-safe postflight и advisors.
5. Провести user-JWT smoke.
6. Переключить staging frontend на одну Edge-команду.
7. Production rollout согласовывать отдельно.

## Граница

В текущей синхронизации не выполняются:

- новый migration apply;
- новый Edge deploy;
- staging schema reconciliation DDL;
- frontend switch;
- production migration или Edge deploy;
- production RLS/grants;
- Auth, Storage или secrets;
- изменения `nav_*`;
- изменения рабочих данных.
