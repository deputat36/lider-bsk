# Canonical action gate для staging leads/orders Edge

Дата первоначального gate: 21 июля 2026 года. Leads workflow extension: 23 июля 2026 года.

## Причина изменения

Staging functions использовали проверенные, но устаревающие локальные role/action матрицы:

- `leader-crm-leads-staging v1` импортировал generic source из commit `17524ea9ef08c11b18b385b9469778d5b1084ddb`;
- `leader-crm-orders v1` импортировал source из commit `4dafa2723c1018574572d9a91441cf382ac25b34`.

После внедрения canonical SQL matrix через PR #410 локальные списки стали вторым источником истины. Дополнительно generic leads update позволял менять рабочий статус и `next_contact_at` без server-side дисциплины.

## Решение

Старые implementations сохранены под отдельными slug:

- `leader-crm-leads-staging-impl v1`;
- `leader-crm-orders-impl v1`.

Исходные slugs принадлежат JWT-first canonical wrappers:

- `leader-crm-leads-staging v4`;
- `leader-crm-orders v3`.

Все функции имеют статус ACTIVE и `verify_jwt=true`.

Leads wrapper v4 добавляет optional execute hook после canonical permission check. Он перехватывает только workflow fields:

- `status`;
- `next_contact_at`;
- `assigned_to`.

Эти поля направляются в атомарную `leader_update_lead_workflow_rpc`. Остальные legacy update fields продолжают делегироваться сохранённой implementation. Смешивание workflow и legacy fields блокируется до implementation.

## Порядок выполнения

Wrapper выполняет действия строго в таком порядке:

1. читает body без бизнес-запросов;
2. проверяет JWT через Auth user endpoint;
3. определяет action и canonical permissions;
4. отклоняет unknown action;
5. вызывает service-role-only `leader_actor_has_crm_action_rpc`;
6. при false возвращает `forbidden`;
7. выполняет optional execute только для явно поддерживаемой атомарной команды;
8. если optional execute не обработал запрос, вызывает preserved implementation с исходным JWT и body.

Unknown action нельзя анонимно использовать как oracle: без JWT запрос не доходит до распознавания action. Browser-supplied role не принимается и не передаётся в permission RPC.

## Permission RPC

Только на staging создан:

`public.leader_actor_has_crm_action_rpc(actor_id, action)`

Функция является bridge к приватному `leader_actor_has_crm_action`.

EXECUTE grantees:

- postgres;
- service_role.

Anon и authenticated не имеют EXECUTE.

## Leads mapping

- dashboard/list → `leads.read`;
- list_orders → `orders.read`;
- create → `leads.create`;
- update → `leads.update`;
- ensure_client → `clients.write`;
- create_order/create_order_from_offer → `orders.create`.

`ensure_profile` остаётся отдельным authenticated bootstrap: сначала JWT, затем прежняя implementation создаёт только неактивный manager profile или синхронизирует email. Доступ к бизнес-действиям он не выдаёт.

## Leads workflow update

Staging migration:

- version `20260723153001`;
- name `staging_lead_workflow_update_rpc_20260723`;
- RPC `public.leader_update_lead_workflow_rpc(jsonb)`;
- action `lead_workflow.update`;
- permission `leads.update`.

Команда требует `request_id`, `expected_updated_at`, `idempotency_key` и выполняет одной транзакцией:

- optimistic concurrency;
- self-assignment без перехвата чужой заявки;
- проверку обязательного ответственного;
- проверку будущего следующего контакта;
- update заявки;
- insert события;
- completion command receipt.

Рабочие статусы без `assigned_to` блокируются. `КП отправлено` и `Ждём ответ` без будущего `next_contact_at` блокируются.

## Orders mapping

- list → `orders.read`;
- status/layout_status/production_status/layout_comment/deadline → `orders.update`;
- payment_status → `finance.write`.

Для запроса с несколькими полями требуются все уникальные permissions. Например, status + payment_status требуют одновременно `orders.update` и `finance.write`.

## Развёрнутые версии

### Leads wrapper

- slug: `leader-crm-leads-staging`;
- version: 4;
- SHA-256: `6ee051d0c8db9154c87bdd3b49b1d60b8bf27f6407c9a2843403886b4999868a`;
- implementation fallback: `leader-crm-leads-staging-impl`;
- workflow RPC: `leader_update_lead_workflow_rpc`.

### Leads implementation

- version: 1;
- pinned commit: `17524ea9ef08c11b18b385b9469778d5b1084ddb`;
- SHA-256: `b3e864d49e4529d6c112ce70185337e71484bfa833676031dfa28e1fb21fe1bd`.

### Orders wrapper

- slug: `leader-crm-orders`;
- version: 3;
- SHA-256: `dccbd8ec3c57cdd58db269e6808f86cdc99f4416ae41eca8b6df24a284649646`;
- implementation: `leader-crm-orders-impl`.

### Orders implementation

- version: 1;
- pinned commit: `4dafa2723c1018574572d9a91441cf382ac25b34`;
- SHA-256: `7ba9f9b59790b0c683a7d3cc64ccfc27fc42c9ea24c9f009a8b064554c5831d7`.

## Проверки

Pure mapping test проверяет leads/orders actions, unknown actions, finance separation и immutable plans.

Транзакционный database test lead workflow проверил:

- рабочий статус без ответственного запрещён;
- accountant запрещён;
- назначение другому сотруднику запрещено;
- self-assignment разрешён;
- ожидание без будущей даты запрещено;
- будущая дата разрешена;
- stale update запрещён;
- replay не создаёт второе событие;
- 2 успешные команды создают 2 события и 2 receipts;
- synthetic profiles после rollback = 0;
- leads/events/receipts после rollback = 0.

Развёрнутые function source повторно прочитаны через Supabase management API. Leads wrapper v4 и shared dependencies соответствуют ветке. Реальный user-JWT запрос для нового lead workflow в этом этапе не выполнялся; это отдельный staging gate. SQL business acceptance и `verify_jwt=true` подтверждены.

## Rollback

Быстрый Edge rollback:

- повторно развернуть leads wrapper v3 SHA `e64036306fefff72bcb457f0f64756bcf40f27cc406e695e3f3d4c76d2b1b4d1`;
- preserved leads implementation v1 остаётся доступной;
- orders wrapper не менялся.

Database rollback должен выполняться отдельно и только при отсутствии workflow receipts; текущий staging postflight содержит 0 workflow receipts.

## Production boundary

Не выполнялись:

- production Edge deploy;
- production DDL/DML;
- production RLS/grants/function changes;
- Auth user creation;
- secrets или Storage changes;
- создание или изменение production заявок, клиентов, заказов, платежей и расходов;
- frontend switch;
- изменения `nav_*`.

Production содержит 13 заявок, но workflow RPC, migration и receipts table отсутствуют. Production rollout требует отдельного explicit approval и предварительного authenticated smoke test.
