# Staging acceptance «производство → монтаж» — 2026-07-31

## Фактический результат

В staging `otulfnouybahfnsycxqn` проверен сценарий:

`готовое производственное задание → монтажное задание → событие`.

Runtime receipt:

`production-to-installation acceptance: OK; cleanup verified: zero residue`.

## Реализованный контракт

Добавлена атомарная команда:

`installation_job.create_from_order`.

RPC:

`public.leader_create_installation_job_from_order_rpc(jsonb)`.

Команда:

- проверяет активный профиль и canonical permission `installation.write`;
- использует `expected_updated_at` заказа;
- запрещает архивные, закрытые и отменённые заказы;
- запрещает монтаж, если для заказа указано `Не требуется`;
- проверяет принадлежность производственного задания заказу;
- разрешает передачу только при статусе производства `Готово` или `Выдано`;
- требует адрес, дату монтажа и исполнителя;
- создаёт одно монтажное задание и одно событие;
- синхронизирует монтажный статус, адрес, дату и исполнителя в заказе;
- сохраняет command receipt;
- возвращает существующее задание при точном повторе;
- возвращает `conflict` при изменении payload с тем же idempotency key;
- блокирует второе активное монтажное задание для заказа.

## Проверенные данные

В монтажное задание перенесены:

- `order_id` и `production_job_id`;
- заголовок и приоритет;
- исполнитель и его телефон;
- адрес и запланированная дата;
- стоимость монтажнику и цена клиенту;
- техническое задание;
- необходимые инструменты.

Заказ получил:

- `installation_status = Запланирован`;
- адрес и дату монтажа;
- исполнителя;
- `current_stage = Монтаж: Запланирован`;
- `next_action = Подготовить и выполнить монтаж`;
- актуальные timestamps.

## Edge Function

В staging развёрнута отдельная JWT-first Edge Function:

`leader-crm-installation-create`.

Deployment metadata:

- версия `1`;
- статус `ACTIVE`;
- `verify_jwt=true`;
- SHA-256 `8fc72c6dba7bfa2e4e8418bdf446f6bcd8f0ea5331aa75b48c40bdf95854a1e9`;
- action `installation_job.create_from_order`;
- permission `installation.write`.

Существующий `leader-crm-installation`, обслуживающий чтение и обновление монтажных заданий, не изменялся.

Authenticated browser E2E создания остаётся отдельным этапом при наличии подходящего staging Auth user. Database runtime, Edge source validation и JWT deployment boundary подтверждены.

## Очистка

Acceptance выполнялся внутри `BEGIN`/`ROLLBACK` с префиксом
`LIDER-INSTALLATION-E2E-20260731`.

После rollback остаток равен нулю для:

- профилей;
- заявок;
- заказов;
- производственных заданий;
- монтажных заданий;
- монтажных событий;
- command receipts.

## Границы

Production Supabase не изменялся.

Production deploy, production cutover, реальные клиенты и заказы, `nav_*` и `parket_*` не затрагивались.
