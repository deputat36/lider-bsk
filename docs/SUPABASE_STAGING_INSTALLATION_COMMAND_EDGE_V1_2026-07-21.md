# Staging installation command Edge v5

Дата обновления: 22 июля 2026 года.

## Deployment

- staging: `otulfnouybahfnsycxqn`;
- Edge: `leader-crm-installation v2`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`;
- contract: `leader-crm-installation-edge-v2`.

Edge обслуживает два действия:

- `installation_job.read` → `installation.read`;
- `installation_job.update` → `installation.write`.

Порядок для обоих действий:

`exact staging guard → verified JWT → strict validation → canonical permission → service-role-only RPC`

Browser role не принимается. RPC повторно проверяют canonical permission.

## Атомарное обновление

`leader_update_installation_job_rpc` не изменена:

- MD5 `0ed4669197dac1f2695d0eec54e1`;
- 19061 bytes;
- job/order/event/receipt одной транзакцией;
- row/advisory locks;
- optimistic concurrency;
- idempotent replay.

После Edge v2 write regression и replay повторно прошли, второе событие не создаётся.

## Безопасное чтение

Migration `20260722050355 / staging_installation_job_read_rpc_20260722` добавила `leader_read_installation_job_rpc(uuid,uuid)`:

- MD5 `98fc1e36b2ed8202e6580d7734088df1`;
- 5378 bytes;
- SECURITY INVOKER;
- `search_path=''`;
- EXECUTE только `service_role`;
- safe projection без контактов клиента, финансов, `orders.data` и внутренних комментариев.

Подробный privacy/RBAC acceptance: `docs/SUPABASE_STAGING_INSTALLATION_READ_EDGE_V1_2026-07-22.md`.

## Postflight

- jobs/items/events/comments/receipts: `0`;
- Auth users и active profiles: `0`;
- Edge logs пусты;
- security ERROR/WARN отсутствуют;
- write regression: success;
- read privacy acceptance: success.

## Runtime gate

User-JWT smoke не выполнен, потому что staging Auth пустой. Auth-пользователи не создавались и прямые изменения `auth.users` не выполнялись.

Frontend switch не выполнен. Production-карточка продолжает использовать прежние direct browser reads/writes. Exact-staging write transport существует только как source-ready модуль и к карточке не подключён.

## Production boundary

Production `ofewxuqfjhamgerwzull` использован только read-only. Read RPC, migration и Edge slug в production отсутствуют. Production DDL/DML, RLS, grants, Auth, Storage, frontend, рабочие данные и `nav_*` не менялись.
