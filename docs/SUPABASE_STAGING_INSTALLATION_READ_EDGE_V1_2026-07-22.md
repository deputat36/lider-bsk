# Staging installation read Edge v1

Дата deployment: 22 июля 2026 года.

## Результат

В staging добавлен безопасный серверный read projection монтажного задания. Он устраняет блокер, при котором installation-таблицы закрыты для browser roles и карточка не может загружать данные напрямую.

Контуры:

- staging: `otulfnouybahfnsycxqn`;
- production read-only: `ofewxuqfjhamgerwzull`;
- Edge: `leader-crm-installation v2`;
- `verify_jwt=true`;
- SHA-256: `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`.

## Действие

- action: `installation_job.read`;
- permission: `installation.read`;
- RPC: `public.leader_read_installation_job_rpc(uuid,uuid)`;
- migration: `20260722050355 / staging_installation_job_read_rpc_20260722`;
- RPC MD5: `98fc1e36b2ed8202e6580d7734088df1`;
- размер функции: `5378` bytes.

Порядок:

`exact staging guard → verified JWT → strict validation → canonical permission → service-role-only read RPC`

RPC повторно проверяет `installation.read`, использует SECURITY INVOKER и `search_path=''`. Для `public`, `anon`, `authenticated` EXECUTE закрыт.

## Safe projection

Возвращаются:

- основные данные задания и `updated_at`;
- безопасная сводка заказа;
- безопасная сводка производства;
- позиции без цен;
- история событий;
- только не-internal комментарии.

Не возвращаются:

- имя и телефон клиента;
- стоимость монтажника и клиентские цены;
- суммы заказа, себестоимость и прибыль;
- `orders.data`;
- внутренние комментарии;
- `owner_id`, `created_by`, `updated_by`.

Ограничения: до 120 позиций, 30 событий и 20 комментариев.

## Acceptance

Rollback-safe SQL-тест специально заполняет скрытые поля маркерами `SENSITIVE_*`.

Подтверждено:

- manager с `installation.read` получает safe projection;
- accountant получает `forbidden`;
- inactive manager получает `forbidden`;
- неизвестное задание даёт `not_found`;
- сериализованный JSON не содержит ни одного `SENSITIVE_*`;
- internal comment не возвращается;
- browser EXECUTE закрыт;
- service-role EXECUTE открыт;
- после `ROLLBACK` fixture-строки отсутствуют.

## Write regression

После deployment Edge v2 повторно проверена существующая команда `installation_job.update`:

- write RPC fingerprint не изменился: `0ed4669197dac1f2695e763d0eec54e1`, 19061 bytes;
- задание и связанный заказ обновляются;
- idempotent replay работает;
- повтор не создаёт второе событие;
- тест завершён внешним `ROLLBACK`.

## Postflight

- jobs/items/events/comments/receipts: `0`;
- Auth users: `0`;
- active profiles: `0`;
- Edge logs пусты;
- security ERROR/WARN отсутствуют;
- performance содержит только ожидаемые `unused_index` INFO для пустого staging-контура.

## Runtime gate

Полный user-JWT smoke не выполнен: staging содержит `0` Auth users и `0` active profiles. Пользователи не создавались, прямые изменения `auth.users` не выполнялись.

Frontend read/write wiring не выполнялось. Source-ready write transport остаётся exact-staging-only и не подключён к production-карточке.

## Production boundary

Production использован только read-only. В production отсутствуют read RPC, migration `20260722050355` и Edge `leader-crm-installation`. Production DDL/DML, RLS, grants, Auth, Storage, frontend, рабочие данные и `nav_*` не менялись.
