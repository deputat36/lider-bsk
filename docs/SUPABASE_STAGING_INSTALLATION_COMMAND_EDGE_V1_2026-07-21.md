# Staging installation command Edge v3

Дата фиксации: 21 июля 2026 года.

## Deployment

Staging: `otulfnouybahfnsycxqn`.

Edge:

- slug: `leader-crm-installation`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`.

Command migration:

- `20260721191810`;
- `staging_installation_job_update_rpc_20260721`;
- source `supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql`.

Compatibility migration:

- `20260721195259`;
- `staging_installation_command_compat_20260721`;
- source `supabase/staging-migrations/20260721_07_installation_command_compat.sql`.

Новый Edge deploy и новый migration apply в текущем цикле не выполнялись. Production не изменялся.

## Команда

Action: `installation_job.update`.

Permission: `installation.write`.

Порядок:

`staging guard → JWT → validation → canonical permission → transactional RPC`

Actor берётся только из проверенного JWT. Browser role не принимается.

Обязательны `request_id`, `expected_updated_at`, `job_id`, `idempotency_key` и allowlisted `patch`.

RPC атомарно обновляет installation job, linked order, event и durable receipt. Используются row locks, advisory locks, optimistic concurrency и idempotent replay. При завершении синхронизируется `installation_completed_at`.

## ACL

Все installation helper/RPC-функции:

- SECURITY INVOKER;
- `search_path=''`;
- `service_role EXECUTE=true`;
- `public/anon/authenticated EXECUTE=false`.

Edge и RPC fingerprints не изменились.

## Postflight

- jobs: `0`;
- job items: `0`;
- events: `0`;
- comments: `0`;
- receipts: `0`;
- Edge logs: ошибок нет;
- новых security ERROR/WARN: нет.

## Schema compatibility

Compatibility migration уже исправила все три order-related FK до production-семантики `ON DELETE SET NULL`:

- `leader_installation_jobs.order_id`;
- `leader_installation_job_items.order_id`;
- `leader_installation_events.order_id`.

Индекс `leader_installation_events_order_id_idx` присутствует.

Остаётся один индекс:

`leader_installation_job_items_order_id_idx`

Source-only кандидат:

`supabase/staging-migrations/20260721_08_installation_items_order_index_candidate.sql`

Rollback:

`supabase/staging-rollbacks/20260721_08_installation_items_order_index_rollback.sql`

Кандидат в текущем цикле не применялся.

## Readiness

Готово:

- Edge/RPC/compat source sync;
- authorization;
- atomic command;
- FK reconciliation;
- events order index.

Не готово:

- remaining job-items order index;
- user-JWT smoke;
- frontend switch;
- production rollout.

`crm/v4/assets/v4/installation-job-card-v2.js` пока выполняет три прямые browser writes. Frontend switch не выполнен и остаётся заблокированным до оставшегося индекса и user-JWT smoke.

## GitHub evidence

- `contracts/crm-staging-installation-command-edge-v1.json`;
- `contracts/crm-staging-installation-schema-v1.json`;
- `tools/check_crm_staging_installation_command_edge.py`;
- `tools/check_crm_staging_installation_schema.py`.

## Production boundary

Production: `ofewxuqfjhamgerwzull`.

Не выполнялись production migration, Edge deploy, frontend switch, изменения RLS/grants, Auth, Storage, secrets, data и `nav_*`.

Production rollout требует отдельного явного согласования.
