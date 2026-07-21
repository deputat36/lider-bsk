# Staging installation command Edge v4

Дата фиксации: 21 июля 2026 года.

## Deployment

Staging: `otulfnouybahfnsycxqn`.

Edge `leader-crm-installation`:

- version `1`;
- status `ACTIVE`;
- `verify_jwt=true`;
- SHA `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`.

Применённые staging-миграции:

- `20260721191810 / staging_installation_job_update_rpc_20260721`;
- `20260721195259 / staging_installation_command_compat_20260721`;
- `20260721200142 / staging_installation_schema_indexes_reconcile_20260721`.

В текущем цикле новый migration apply и Edge deploy не выполнялись. Production не изменялся.

## Команда

Action: `installation_job.update`.

Permission: `installation.write`.

Порядок:

`staging guard → JWT → validation → canonical permission → transactional RPC`

Browser role не принимается. RPC повторно проверяет право, row locks, advisory locks, `expected_updated_at`, idempotency key и request ID.

Одной транзакцией обновляются:

- installation job;
- linked order;
- installation event;
- durable receipt.

При завершении синхронизируется `installation_completed_at`.

## ACL и fingerprints

Все installation helper/RPC-функции:

- SECURITY INVOKER;
- `search_path=''`;
- `service_role EXECUTE=true`;
- browser EXECUTE закрыт.

RPC MD5: `0ed4669197dac1f2695e763d0eec54e1`.

## Postflight

- jobs/items/events/comments: 0;
- receipts: 0;
- FK drift: отсутствует;
- missing covering indexes: отсутствуют;
- `leader_installation_job_items_order_id_idx`: присутствует;
- `leader_installation_events_order_id_idx`: присутствует;
- missing-FK-index warnings: 0;
- Edge logs: ошибок нет.

`unused_index` INFO ожидаемы для пустого staging и не означают, что новые FK-индексы нужно удалять.

## Readiness

Готово:

- Edge/RPC source sync;
- compat/index reconciliation source sync;
- authorization;
- atomic command;
- schema reconciliation.

Не готово:

- authenticated user-JWT smoke;
- frontend switch;
- production rollout.

`installation-job-card-v2.js` пока выполняет три прямые browser writes. Frontend switch не выполнен и остаётся заблокированным до user-JWT smoke.

## Evidence

- `contracts/crm-staging-installation-command-edge-v1.json` — version 4;
- `contracts/crm-staging-installation-schema-v1.json` — version 5;
- `tools/check_crm_staging_installation_command_edge.py`;
- `tools/check_crm_staging_installation_schema.py`.

## Production boundary

Production: `ofewxuqfjhamgerwzull`.

Не выполнялись production migration, Edge deploy, frontend switch, изменения RLS/grants, Auth, Storage, secrets, data и `nav_*`.
