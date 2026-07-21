# Каноническая server-side матрица действий CRM — staging

Дата проверки: 21 июля 2026 года.

## Цель

Устранить drift между браузерной матрицей `CRM_V4_ROLE_ACTIONS` и будущими server-side проверками прав, не изменяя production Supabase.

## Production baseline — только чтение

Production project: `ofewxuqfjhamgerwzull`.

Подтверждено:

- 4 активных профиля: 2 owner, 1 admin, 1 manager;
- `leader_role_permissions` содержит семь legacy-ролей, legacy tabs и флаги, но не canonical action keys;
- расчёты, позиции расчётов, КП, заказы, платежи, расходы и производственные задания используют широкие policies через `leader_has_access()`;
- `leader_design_tasks` разрешает SELECT/INSERT/UPDATE любому активному профилю;
- production functions, policies, grants, данные, Auth, Storage и Edge Functions не менялись.

## GitHub contract

Создан `contracts/crm-v4-role-action-matrix-v1.json`:

- 7 canonical ролей;
- 39 canonical action keys;
- точная матрица owner/admin/manager/accountant/designer/installer/contractor;
- unknown role/action и inactive profile — deny;
- production deployment — только после отдельного явного approval.

`tools/test_crm_role_action_matrix.mjs` импортирует реальный `action-permissions-v1.js` и проверяет полное совпадение JSON-контракта с browser source.

## Staging migration

Staging project: `otulfnouybahfnsycxqn`.

Применены только staging migrations:

- `20260721_01_canonical_action_rbac.sql`;
- `20260721_02_role_action_matrix_policy.sql`.

Создана приватная таблица:

`leader_private.leader_role_action_matrix_v1`

Фактические количества действий:

- owner — 39;
- admin — 39;
- manager — 30;
- accountant — 8;
- designer — 4;
- installer — 2;
- contractor — 2.

Таблица:

- находится вне exposed schema;
- имеет RLS;
- имеет явную deny policy для anon/authenticated;
- не выдаёт browser roles табличных privileges;
- доступна service_role для server-side проверки.

## Authorization helpers

Создан actor-aware helper:

`leader_private.leader_actor_has_crm_action(actor_id, action)`

Правила:

- actor определяется server-side;
- профиль обязан быть активным;
- роль читается только из `leader_user_profiles`;
- действие проверяется по приватной canonical matrix;
- unknown role/action, null actor и inactive profile возвращают false;
- EXECUTE доступен только postgres/service_role.

Обновлён RLS helper:

`leader_private.leader_has_crm_action(action)`

Он принимает только action и получает actor через `auth.uid()`. EXECUTE доступен authenticated/service_role. Browser-supplied actor id или role не принимаются.

## Design RPC boundary

Существующая проверенная бизнес-реализация переименована в:

`leader_create_design_task_from_order_impl_rpc(jsonb)`

Публичное имя сохранено за authorization wrapper:

`leader_create_design_task_from_order_rpc(jsonb)`

Wrapper:

1. проверяет payload shape и actor UUID;
2. допускает только action `design_task.create_from_order`;
3. проверяет canonical `design.write`;
4. при отказе возвращает код forbidden до business reads;
5. только после разрешения вызывает существующую реализацию.

Обе функции доступны только service_role. Browser roles не получили EXECUTE.

## Staging test

Запущен `supabase/staging-tests/20260721_canonical_action_rbac.sql` внутри транзакции с обязательным rollback.

Проверено:

- positive: owner/admin/manager/designer;
- negative: accountant/installer/contractor для design actions;
- positive domain actions для accountant/installer/contractor;
- manager не получает finance.read;
- designer не получает orders.read;
- inactive profile denied;
- unknown role denied;
- unknown action denied;
- null actor denied;
- auth.uid wrapper разрешает designer design.read и запрещает finance.read;
- accountant design RPC получает `forbidden` до business validation;
- designer проходит authorization boundary и получает ответ дальнейшей business validation, а не `forbidden`;
- после rollback synthetic profiles = 0.

## Grants verification

Фактически подтверждено:

- actor helper: postgres + service_role;
- auth.uid helper: postgres + authenticated + service_role;
- design wrapper RPC: postgres + service_role;
- design implementation RPC: postgres + service_role.

## Advisors

Security advisor после deny policy больше не показывает новый lint для `leader_role_action_matrix_v1`.

Остались только ранее существовавшие INFO notices тестового контура, включая private command receipts, environment guard и несколько staging tables без policies.

Performance advisor не выявил новых проблем. Остались два ранее существовавших unused-index INFO notices.

## Production boundary

Не выполнялись:

- production DDL/DML;
- production RLS/grants/functions changes;
- production Edge Function deploy;
- Auth/Storage/secrets changes;
- перенос legacy `leader_role_permissions`;
- автоматическое изменение пользователей или рабочих данных.

Следующий безопасный этап — использовать canonical helper в других staging RPC/RLS domains и подготовить отдельный production rollout plan с rollback и explicit approval.
