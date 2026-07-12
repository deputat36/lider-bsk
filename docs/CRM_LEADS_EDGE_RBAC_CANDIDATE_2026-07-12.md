# `leader-crm-leads`: server-side RBAC candidate — 2026-07-12

Связано: #200, #202, #204.

Статус: source-only candidate. Production Supabase не изменён, Edge Function не разворачивалась.

## Проблема

Live `leader-crm-leads v12` подтверждает JWT и активный профиль, а затем выполняет service-role REST/RPC действия без проверки роли на конкретный action.

Это означает, что любой активный профиль потенциально может вызывать общий endpoint для чтения лидов и заказов, создания/изменения лидов, создания клиента и конвертации заказа.

## Реализованный candidate contract

Matrix version: `20260712-leads-role-matrix-1`.

Canonical roles:

- `owner`;
- `admin`;
- `manager`;
- `accountant`;
- `designer`;
- `installer`;
- `contractor`.

Неизвестная роль получает `403 forbidden` до обращения к бизнес-таблице.

## Action map

| Edge action | Permission | owner/admin | manager | accountant | designer | installer | contractor |
|---|---|---:|---:|---:|---:|---:|---:|
| `dashboard` | `leads.read` | allow | allow | deny | deny | deny | deny |
| `list` | `leads.read` | allow | allow | deny | deny | deny | deny |
| `list_orders` | `orders.read` | allow | allow | allow | deny | deny | deny |
| `create` | `leads.create` | allow | allow | deny | deny | deny | deny |
| `update` | `leads.update` | allow | allow | deny | deny | deny | deny |
| `ensure_client` | `clients.write` | allow | allow | deny | deny | deny | deny |
| `create_order` | `orders.create` | allow | allow | deny | deny | deny | deny |
| `create_order_from_offer` | `orders.create` | allow | allow | deny | deny | deny | deny |

`ensure_profile` остаётся специальным bootstrap action до active-profile check. Он может создать только собственный pending-профиль `manager/is_active=false` и не разрешает самоактивацию или назначение роли.

## Role-specific projection

### Лиды

Lead payload доступен только `owner`, `admin`, `manager`.

### Заказы

- `owner/admin`: полный утверждённый operational/finance набор;
- `manager`: без `contractor_cost` и `profit`;
- `accountant`: минимальная order/finance projection без production/design полей;
- `designer/installer/contractor`: generic orders list запрещён.

Полный `order` JSON, возвращаемый `leader_create_order_from_offer_rpc`, повторно проектируется Edge Function перед отправкой клиенту. Это закрывает обход role projection через RPC response.

## Дополнительные ограничения

- неизвестный action возвращает `400 unknown_action` до active-profile business dispatch;
- `update` без поддерживаемых полей возвращает `400 no_update_fields`;
- action permission проверяется до business REST/RPC;
- success/forbidden response содержит matrix version для evidence;
- browser UI registry продолжает показывать `serverEnforcement=false`, пока candidate не протестирован и не развёрнут.

## Что candidate ещё не решает

- ручной `create_order` остаётся multi-step и должен быть заменён transaction-backed command;
- privileged action audit events ещё не введены;
- CORS policy не ужесточена;
- live deployment и role test users отсутствуют;
- public intake bypass не относится к этой функции и исправляется отдельным coordinated cutover.

## Обязательные тесты на development branch

Positive:

1. owner/admin выполняют все actions;
2. manager читает/создаёт/изменяет лиды, создаёт клиента и заказ;
3. accountant читает только order/finance projection;
4. `ensure_profile` создаёт только pending profile.

Negative:

1. inactive profile получает `403 access_denied`;
2. unknown role получает `403 forbidden`;
3. accountant не читает leads и не создаёт order;
4. designer/installer/contractor не используют generic endpoint;
5. manager response не содержит `contractor_cost`/`profit`;
6. accountant response не содержит layout/production/internal payload;
7. forbidden action не вызывает business REST/RPC;
8. unknown action возвращает `400`;
9. empty update возвращает `400 no_update_fields`.

## Deployment gate

До production deploy необходимо:

1. получить стоимость и явное подтверждение Supabase development branch;
2. развернуть candidate только в development branch;
3. выполнить positive/negative role matrix tests;
4. сохранить Network evidence и response fields;
5. подготовить rollback на live `leader-crm-leads v12`;
6. получить отдельное явное production approval.
