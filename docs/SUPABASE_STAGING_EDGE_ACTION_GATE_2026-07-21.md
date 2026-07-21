# Canonical action gate для staging leads/orders Edge

Дата: 21 июля 2026 года.

## Причина изменения

Staging functions использовали проверенные, но устаревающие локальные role/action матрицы:

- `leader-crm-leads-staging v1` импортировал generic source из commit `17524ea9ef08c11b18b385b9469778d5b1084ddb`;
- `leader-crm-orders v1` импортировал source из commit `4dafa2723c1018574572d9a91441cf382ac25b34`.

После внедрения canonical SQL matrix через PR #410 эти локальные списки стали вторым источником истины.

## Решение

Бизнес-реализации не переписывались.

Старые deployed implementations сохранены под отдельными slug:

- `leader-crm-leads-staging-impl v1`;
- `leader-crm-orders-impl v1`.

Исходные slugs теперь принадлежат JWT-first canonical wrappers:

- `leader-crm-leads-staging v3`;
- `leader-crm-orders v3`.

Все четыре функции имеют статус ACTIVE и `verify_jwt=true`.

## Порядок выполнения

Wrapper выполняет действия строго в таком порядке:

1. читает body без бизнес-запросов;
2. проверяет JWT через Auth user endpoint;
3. определяет action и canonical permissions;
4. отклоняет unknown action;
5. вызывает service-role-only `leader_actor_has_crm_action_rpc`;
6. при false возвращает `forbidden`;
7. только после разрешения вызывает implementation slug с исходным JWT и body.

Unknown action больше нельзя анонимно использовать как oracle: без JWT запрос не доходит до распознавания action.

Browser-supplied role не принимается и не передаётся в permission RPC.

## Permission RPC

Только на staging создан:

`public.leader_actor_has_crm_action_rpc(actor_id, action)`

Функция является bridge к приватному `leader_actor_has_crm_action` из PR #410.

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

## Orders mapping

- list → `orders.read`;
- status/layout_status/production_status/layout_comment/deadline → `orders.update`;
- payment_status → `finance.write`.

Для запроса с несколькими полями требуются все уникальные permissions. Например, status + payment_status требуют одновременно `orders.update` и `finance.write`.

Update без полей требует `orders.update`, после чего прежняя implementation вернёт `no_update_fields`.

## Развёрнутые версии

### Leads wrapper

- slug: `leader-crm-leads-staging`;
- version: 3;
- SHA-256: `e64036306fefff72bcb457f0f64756bcf40f27cc406e695e3f3d4c76d2b1b4d1`;
- implementation: `leader-crm-leads-staging-impl`.

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

Pure mapping test проверяет:

- все leads actions;
- ensure_profile bootstrap;
- unknown actions;
- orders list;
- operations fields;
- finance field separation;
- multi-field permission union;
- immutable plan objects.

Транзакционный database test проверил:

- owner: leads.read и orders.update разрешены;
- accountant: orders.read и finance.write разрешены;
- accountant: orders.update запрещён;
- unknown action запрещён;
- synthetic profiles после rollback = 0.

Развёрнутые function source повторно прочитаны через Supabase management API. Wrapper-файлы и shared dependencies соответствуют ветке.

Edge runtime logs после deployment пусты: boot errors не зарегистрированы, но реальный user-JWT запрос не выполнялся. Тестовых Auth-пользователей и паролей не создавали. Missing-token path подтверждён JWT-first wrapper-кодом и обязательной платформенной настройкой `verify_jwt=true`, но отдельный HTTP probe из доступных инструментов не выполнялся.

## Rollback

Быстрый rollback не требует изменений базы или бизнес-данных:

- для leads повторно развернуть прежний pinned import под `leader-crm-leads-staging`;
- для orders повторно развернуть прежний pinned import под `leader-crm-orders`.

Implementation slugs уже содержат эти версии и могут использоваться как точный источник rollback.

## Production boundary

Не выполнялись:

- production Edge deploy;
- production DDL/DML;
- production RLS/grants/function changes;
- Auth user creation;
- secrets или Storage changes;
- бизнес-запросы с service role;
- создание или изменение заявок, клиентов, заказов, платежей и расходов.

Production rollout требует отдельного explicit approval и предварительного smoke test с реальными ролями.
