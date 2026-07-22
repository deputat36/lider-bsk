# Staging installation read Edge v2

Дата обновления: 22 июля 2026 года.

## Результат

На staging `otulfnouybahfnsycxqn` работает JWT-first действие `installation_job.read` с canonical permission `installation.read`.

Контур:

- Edge `leader-crm-installation v2`;
- `verify_jwt=true`;
- SHA-256 `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`;
- RPC `public.leader_read_installation_job_rpc(uuid,uuid)`;
- SECURITY INVOKER, `search_path=''`;
- EXECUTE только `service_role`.

## Safe projection

Возвращаются job, безопасная сводка заказа и производства, позиции без цен, события и только не-internal комментарии. В order projection теперь явно входит `installation_status`.

Не возвращаются контакты клиента, финансовые поля, `orders.data`, внутренние комментарии и server-owned actor fields.

## Обнаруженный дефект

Первый реальный JWT smoke подтвердил, что update RPC правильно меняет job и связанный order, но read projection не включала ключ `order.installation_status`.

Исправление:

- migration `20260722055815`;
- name `staging_installation_read_order_status_fix_20260722`;
- source `supabase/staging-migrations/20260722_03_installation_read_order_status_fix.sql`.

Текущий fingerprint read RPC:

- MD5 `5a353818606012d0e657a83f133723b6`;
- 5432 bytes.

## Runtime user-JWT smoke

Финальный smoke использовал реальные краткоживущие JWT двух staging-профилей.

Подтверждено:

- missing JWT → `401`;
- invalid JWT → `401`;
- accountant read → `403`;
- manager read → `200`;
- privacy projection не содержит ни одного `SENSITIVE_*`;
- internal comment и item prices скрыты;
- после update повторный read возвращает `job.install_status = Запланирован` и `order.installation_status = Запланирован`.

Полное evidence: `contracts/crm-staging-installation-runtime-smoke-v1.json`.

## Postflight

После smoke:

- Auth users/profiles: `0`;
- jobs/items/events/comments/receipts: `0`;
- временный `pg_net` удалён;
- bootstrap оставлен только в permanently locked версии с `verify_jwt=true`;
- security ERROR/WARN отсутствуют;
- performance содержит только INFO для unused indexes пустого staging-контура.

Frontend read/write wiring ещё не выполнено. Runtime gate снят только для отдельного exact-staging UI PR.

## Production boundary

Production `ofewxuqfjhamgerwzull` использован только read-only. В production отсутствуют read RPC, fix migration и installation/bootstrap Edge. Production DDL/DML, RLS, grants, Auth, Storage, frontend, рабочие данные и `nav_*` не менялись.
