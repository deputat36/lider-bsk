# Staging installation schema v5

Дата фиксации: 21 июля 2026 года.

## Результат

Staging `otulfnouybahfnsycxqn` полностью согласован с read-only production baseline `ofewxuqfjhamgerwzull` по installation FK и покрывающим индексам.

Применённые staging-миграции:

- `20260721191810 / staging_installation_job_update_rpc_20260721`;
- `20260721195259 / staging_installation_command_compat_20260721`;
- `20260721200142 / staging_installation_schema_indexes_reconcile_20260721`.

GitHub sources:

- `supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql`;
- `supabase/staging-migrations/20260721_07_installation_command_compat.sql`;
- `supabase/staging-migrations/20260721_09_installation_schema_indexes_reconcile.sql`.

В текущем цикле эти миграции не применялись: их фактическое существование обнаружено read-only postflight и синхронизировано с GitHub.

## Схема

Присутствуют четыре таблицы:

- `leader_installation_jobs` — 0 строк;
- `leader_installation_job_items` — 0 строк;
- `leader_installation_events` — 0 строк;
- `leader_installation_comments` — 0 строк.

Receipts `installation_job.update`: 0.

Все order-related FK соответствуют production:

- jobs.order_id → `ON DELETE SET NULL`;
- job_items.order_id → `ON DELETE SET NULL`;
- events.order_id → `ON DELETE SET NULL`.

Оба покрывающих индекса присутствуют:

- `leader_installation_job_items_order_id_idx`;
- `leader_installation_events_order_id_idx`.

Performance Advisor больше не показывает missing-FK-index предупреждения по installation. Оставшиеся `unused_index` INFO ожидаемы для пустого staging.

## Доступ

- RLS включён;
- browser policies отсутствуют;
- `public`, `anon`, `authenticated` table privileges отсутствуют;
- `service_role` имеет минимальные права;
- production не изменялся.

## Команда

Активны:

- `leader_update_installation_job_rpc(jsonb)`;
- Edge `leader-crm-installation v1`;
- `verify_jwt=true`;
- Edge SHA `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`.

RPC fingerprint: `0ed4669197dac1f2695e763d0eec54e1`.

## Readiness

Готово:

- schema reconciliation;
- FK/index alignment;
- Edge/RPC/compat/index sources;
- authorization;
- atomic command.

Не готово:

- authenticated user-JWT smoke;
- frontend switch;
- production rollout.

Frontend switch остаётся заблокированным до user-JWT smoke.

## Проверки

- `contracts/crm-staging-installation-schema-v1.json` — version 5;
- `contracts/crm-staging-installation-command-edge-v1.json` — version 4;
- `tools/check_crm_staging_installation_schema.py`;
- `tools/check_crm_staging_installation_command_edge.py`.

## Граница

В текущем цикле не выполнялись migration apply, Edge deploy, frontend switch, изменения рабочих данных, production RLS/grants, Auth, Storage, secrets и `nav_*`.
