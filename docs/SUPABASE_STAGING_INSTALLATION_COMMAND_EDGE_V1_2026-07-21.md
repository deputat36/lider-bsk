# Staging installation command Edge v2

Дата фиксации: 21 июля 2026 года.

## Назначение

Зафиксировать уже работающий staging transport для атомарного обновления монтажного задания и устранить deployment drift между Supabase и GitHub.

В рамках этой синхронизации новый Edge deploy и новый migration apply не выполнялись. Deployment был обнаружен read-only postflight. Production не изменялся.

## Фактический staging deployment

Проект: `otulfnouybahfnsycxqn`.

Edge Function:

- slug: `leader-crm-installation`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`;
- source contract: `leader-crm-installation-edge-v1`.

Database:

- migration version: `20260721191810`;
- migration name: `staging_installation_job_update_rpc_20260721`;
- RPC: `public.leader_update_installation_job_rpc(jsonb)`;
- schema contract: version `3`;
- schema reconciliation: требуется.

## Команда

Action: `installation_job.update`.

Canonical permission: `installation.write`.

Порядок выполнения:

1. Проверка точного staging project ref.
2. Проверка пользовательского JWT через `/auth/v1/user`.
3. Строгая валидация envelope, payload и patch.
4. Проверка `installation.write` через `leader_actor_has_crm_action_rpc`.
5. Вызов service-role-only `leader_update_installation_job_rpc`.

Роль не принимается из browser payload. Actor ID и email берутся только из проверенного JWT.

Обязательны `request_id`, `expected_updated_at`, `job_id`, `idempotency_key` и непустой allowlisted `patch`. Максимальный размер тела — 64 KiB.

Разрешённые patch-поля:

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

## Атомарность

RPC выполняет одной транзакцией:

- UPDATE `leader_installation_jobs`;
- UPDATE связанного `leader_orders`;
- INSERT `leader_installation_events`;
- INSERT/UPDATE `leader_private.leader_command_receipts`.

Используются row locks для job и order, advisory locks для idempotency key и request ID, optimistic concurrency через `expected_updated_at`, idempotent replay и safe error projection.

При статусе `В работе` сервер выставляет `started_at`. При статусе `Выполнен` выставляются `completed_at` и поле заказа `installation_completed_at`.

## ACL и fingerprints

Все пять installation-функций имеют SECURITY INVOKER, `search_path=''` и `service_role EXECUTE=true`. Для `public`, `anon`, `authenticated` EXECUTE закрыт.

Fingerprints:

- `leader_installation_command_error`: `d263ee000b817642f549016be44d80de`, 365 bytes;
- `leader_installation_status_key`: `12243bd5d50a49a8bf7e281d715bba03`, 894 bytes;
- `leader_installation_status_label`: `3a1082636d166768f2b3334d76e1743d`, 555 bytes;
- `leader_installation_transition_allowed`: `2463ec1b87fa4cf46a04590ac7e97d60`, 600 bytes;
- `leader_update_installation_job_rpc`: `0ed4669197dac1f2695e763d0eec54e1`, 19061 bytes.

Четыре installation-таблицы имеют RLS, закрытые browser privileges и минимальные service-role grants.

## Postflight

Read-only postflight:

- installation jobs: `0`;
- installation job items: `0`;
- installation events: `0`;
- installation comments: `0`;
- command receipts: `0`;
- Edge logs: ошибок нет;
- новых security ERROR/WARN: нет.

## Schema readiness

Edge source, RPC source, authorization и атомарная команда готовы.

Schema reconciliation ещё не завершён:

- `leader_installation_jobs.order_id`: CASCADE вместо production SET NULL;
- `leader_installation_job_items.order_id`: CASCADE вместо production SET NULL;
- `leader_installation_events.order_id`: CASCADE вместо production SET NULL;
- отсутствует `leader_installation_job_items_order_id_idx`;
- отсутствует `leader_installation_events_order_id_idx`.

Performance Advisor подтверждает два отсутствующих FK-индекса. DDL в этом PR не выполняется.

Readiness:

- Edge source synced: да;
- RPC source synced: да;
- authorization ready: да;
- atomic command ready: да;
- schema reconciliation ready: нет;
- user-JWT smoke completed: нет;
- frontend switch ready: нет;
- production ready: нет.

## GitHub source

- Edge: `supabase/staging-functions/leader-crm-installation/index.ts`;
- contract: `supabase/staging-functions/leader-crm-installation/contract.ts`;
- RPC source: `supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql`;
- evidence: `contracts/crm-staging-installation-command-edge-v1.json`;
- checker: `tools/check_crm_staging_installation_command_edge.py`;
- workflow: `.github/workflows/crm-staging-installation-command-edge-check.yml`.

## Frontend boundary

`crm/v4/assets/v4/installation-job-card-v2.js` пока сохраняет монтаж тремя прямыми browser writes: job, linked order и event.

Frontend switch не выполнен. Переключение запрещено до schema reconciliation и user-JWT smoke.

## Production boundary

Production проект: `ofewxuqfjhamgerwzull`.

Не выполнялись production migration, Edge deploy, frontend switch, изменения RLS/grants, Auth, Storage, secrets, production data и `nav_*`.

Production rollout требует отдельного явного согласования и самостоятельного rollback-плана.
