# Staging installation schema v4

Дата аудита и синхронизации: 21 июля 2026 года.

## Текущее состояние

Staging-проект: `otulfnouybahfnsycxqn`.

Production read-only baseline: `ofewxuqfjhamgerwzull`.

В staging существуют четыре installation-таблицы:

- `leader_installation_jobs` — 0 строк;
- `leader_installation_job_items` — 0 строк;
- `leader_installation_events` — 0 строк;
- `leader_installation_comments` — 0 строк.

Receipts для `installation_job.update`: 0.

RLS включён. Browser policies и table privileges для `public`, `anon`, `authenticated` отсутствуют. Контур доступен только через `service_role` за JWT-first Edge.

## Применённые staging-миграции

Команда монтажа:

- version: `20260721191810`;
- name: `staging_installation_job_update_rpc_20260721`;
- source: `supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql`.

Compatibility migration:

- version: `20260721195259`;
- name: `staging_installation_command_compat_20260721`;
- source: `supabase/staging-migrations/20260721_07_installation_command_compat.sql`.

Compatibility migration уже выровняла с production три FK:

- `leader_installation_jobs.order_id` — `ON DELETE SET NULL`;
- `leader_installation_job_items.order_id` — `ON DELETE SET NULL`;
- `leader_installation_events.order_id` — `ON DELETE SET NULL`.

Также присутствует `leader_installation_events_order_id_idx`.

## Единственное оставшееся расхождение

Отсутствует покрывающий индекс:

`leader_installation_job_items_order_id_idx`

Source-only кандидат:

`supabase/staging-migrations/20260721_08_installation_items_order_index_candidate.sql`

Rollback:

`supabase/staging-rollbacks/20260721_08_installation_items_order_index_rollback.sql`

Кандидат в текущем цикле не применялся. Performance Advisor продолжает показывать только этот непокрытый FK.

## Production baseline

Production read-only аудит подтвердил:

- `leader_installation_jobs`: 30 полей;
- `leader_installation_job_items`: 12 полей;
- `leader_installation_events`: 9 полей;
- `leader_installation_comments`: 7 полей;
- все order-related FK используют `ON DELETE SET NULL`;
- job-related дочерние FK используют `ON DELETE CASCADE`;
- все FK имеют покрывающие индексы;
- поле заказа `installation_completed_at` существует.

Canonical clean-staging source:

`supabase/staging-migrations/20260721_05_installation_schema_install.sql`

Rollback-safe acceptance:

`supabase/staging-tests/20260721_installation_schema_acceptance.sql`

## Атомарная команда

В staging активны:

- `public.leader_update_installation_job_rpc(jsonb)`;
- четыре service-role-only helper-функции;
- Edge `leader-crm-installation v1`;
- `verify_jwt=true`;
- Edge SHA `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`.

RPC остаётся SECURITY INVOKER с `search_path=''` и закрытым EXECUTE для browser roles.

## Readiness

Готово:

- Edge source sync;
- RPC source sync;
- canonical authorization;
- atomic job/order/event/receipt command;
- FK reconciliation;
- events `order_id` index.

Не готово:

- индекс `leader_installation_job_items_order_id_idx`;
- user-JWT smoke;
- frontend switch;
- production rollout.

## Автоматические проверки

Schema contract:

`contracts/crm-staging-installation-schema-v1.json`

Command contract:

`contracts/crm-staging-installation-command-edge-v1.json`

Checkers:

- `tools/check_crm_staging_installation_schema.py`;
- `tools/check_crm_staging_installation_command_edge.py`.

Workflows:

- `.github/workflows/crm-staging-installation-schema-check.yml`;
- `.github/workflows/crm-staging-installation-command-edge-check.yml`.

CI запрещает скрывать оставшийся индексный drift, заявлять неприменённый DDL выполненным или разрешать frontend switch раньше user-JWT smoke.

## Граница

В текущем цикле не выполнялись:

- новый migration apply;
- новый Edge deploy;
- remaining index DDL;
- frontend switch;
- production migration или Edge deploy;
- изменения production RLS/grants/data;
- изменения Auth, Storage, secrets и `nav_*`.

Production не изменялся.
