# CRM order operational quality — manual test 2026-07-12

Related: #200, #205, #217.

Mode: read-only browser and Network verification. Do not modify production rows for this test.

## Read-only baseline

At the source-change checkpoint, for non-archived orders:

- total orders — 5;
- orders without any `leader_expenses` row — 5;
- orders requiring design but without a linked `leader_design_tasks` row — 2;
- orders without `assigned_to` — 5;
- overdue active orders — 4.

Repeat the read-only SQL before comparing counts because production data may change.

## Browser steps

1. Sign in with owner/admin or manager access.
2. Open `?tab=order_control`.
3. Wait for the standard order-control dashboard and the block `Операционное качество заказов`.
4. Verify five queues are visible:
   - `Без учтённых расходов`;
   - `Нужен дизайн, задачи нет`;
   - `Без ответственного`;
   - `Просроченные заказы`;
   - `Неизвестные статусы`.
5. Open each queue. A row may contain only order number, status and deadline.
6. Confirm no project name, client name, phone, email, address, message, financial amount, cost or profit appears in the quality panel or modal.
7. Press `Открыть заказ`; the standard order card must open and the quality modal must close.
8. Press `Обновить очереди`; no duplicate panel or modal must appear.
9. Press the standard `Обновить` button in order control; after its re-render the quality block must be restored once.
10. In a development branch only, add a synthetic unknown order status. It must appear in `Неизвестные статусы` and remain in active control without rewriting the row.

## Network contract

Allowed SELECT projections:

- `leader_orders`: `id,order_number,status,deadline,lead_id,assigned_to,is_archived`;
- `leader_expenses`: `order_id`;
- `leader_lead_needs`: `lead_id,need_design`;
- `leader_design_tasks`: `order_id`.

The module must not request:

- project name;
- client name or phone;
- email, message or address;
- order JSON or internal comments;
- design-task text or status;
- payment totals, prices, costs, expenses amounts or profit.

The module must not issue INSERT, UPDATE, DELETE, UPSERT, RPC or Edge Function requests.

## Pass criteria

- queue counts match the read-only baseline or a freshly repeated query;
- archived and terminal orders are excluded;
- unknown statuses remain active and visible;
- design queue is based on `need_design=true` and absence of an order-linked design task;
- expense queue is based on absence of any order-linked expense row;
- panel survives standard order-control re-renders without duplication;
- opening a queue or order creates no write request;
- no project name, PII or financial amount appears in the quality queues;
- no console errors appear;
- `nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched.

Manual verification remains required before closing #205.
