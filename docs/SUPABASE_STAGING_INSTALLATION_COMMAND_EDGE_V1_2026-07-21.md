# Staging installation command Edge v4

Дата reconciliation: 21 июля 2026 года.

## Deployment

- staging: `otulfnouybahfnsycxqn`;
- Edge: `leader-crm-installation v1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`;
- action: `installation_job.update`;
- permission: `installation.write`;
- RPC: `public.leader_update_installation_job_rpc(jsonb)`.

Новый Edge deploy в текущем цикле не выполнялся.

## Schema readiness

Schema reconciliation завершён:

- `20260721195259` — FK/compat migration;
- `20260721200142` — final index reconciliation.

Все три `order_id` FK используют `ON DELETE SET NULL`, присутствуют все девять production-compatible индексов, missing FK-index advice отсутствует.

## Команда

Порядок:

`staging guard → JWT → validation → canonical permission → transactional RPC`

Browser role не принимается. RPC одной транзакцией обновляет job, linked order, installation event и command receipt. Используются row locks, advisory locks, optimistic concurrency, idempotent replay и safe response.

## Postflight

- installation jobs/items/events/comments: `0`;
- receipts: `0`;
- RPC EXECUTE: только `service_role`;
- RPC fingerprint и Edge SHA не изменились;
- Edge logs пусты;
- command smoke: success;
- replay: success без второго события;
- security ERROR/WARN: нет.

## Readiness

- Edge source synced: да;
- RPC source synced: да;
- authorization ready: да;
- atomic command ready: да;
- schema reconciliation ready: да;
- user-JWT smoke completed: нет;
- frontend switch ready: нет;
- production ready: нет.

`installation-job-card-v2.js` пока использует три direct browser writes. Переключение не выполнялось.

## Production boundary

Production проект `ofewxuqfjhamgerwzull` использован только read-only. В нём отсутствуют installation RPC, reconciliation migrations и Edge slug. Production rollout требует отдельного approval и rollback-плана.
