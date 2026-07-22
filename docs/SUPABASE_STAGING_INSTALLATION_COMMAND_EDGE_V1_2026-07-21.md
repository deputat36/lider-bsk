# Staging installation command Edge v6

Дата обновления: 22 июля 2026 года.

## Deployment

- staging `otulfnouybahfnsycxqn`;
- Edge `leader-crm-installation v2`;
- `verify_jwt=true`;
- SHA-256 `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`.

Действия:

- `installation_job.read` → `installation.read`;
- `installation_job.update` → `installation.write`.

Порядок: exact staging guard → verified JWT → strict validation → canonical permission → service-role-only RPC.

## Атомарное обновление

`leader_update_installation_job_rpc` не изменилась:

- MD5 `0ed4669197dac1f2695e763d0eec54e1`;
- 19061 bytes;
- job/order/event/receipt одной транзакцией;
- row/advisory locks;
- optimistic concurrency;
- idempotent replay.

Реальный runtime smoke подтвердил `201` при первом update и `200` при replay; второе событие не создаётся.

## Безопасное чтение

Read RPC после projection fix:

- MD5 `5a353818606012d0e657a83f133723b6`;
- 5432 bytes;
- SECURITY INVOKER;
- `search_path=''`;
- EXECUTE только `service_role`;
- order projection включает `installation_status`;
- контакты клиента, финансы, `orders.data` и internal comments исключены.

## Runtime gate

User-JWT smoke выполнен и завершён clean:

- read: `401`, `401`, `403`, `200`;
- update: `403`, `201`, replay `200`;
- post-update read: `200`;
- privacy projection: success;
- linked order consistency: success;
- single update event: success.

Auth users, profiles, fixtures и receipts после cleanup равны `0`. Временный `pg_net` удалён. Bootstrap permanently locked.

Runtime evidence: `contracts/crm-staging-installation-runtime-smoke-v1.json`.

## Frontend

Frontend switch не выполнен. Production-карточка продолжает использовать прежние direct browser reads/writes. Runtime gate теперь позволяет отдельный exact-staging UI wiring PR, но не production rollout.

## Production boundary

Production `ofewxuqfjhamgerwzull` использован только read-only. Read RPC/fix migration и installation/bootstrap Edge в production отсутствуют. Production DDL/DML, RLS, grants, Auth, Storage, frontend, рабочие данные и `nav_*` не менялись.
