# Server-side RBAC для CRM РА «Лидер» — спецификация действий

Дата: 2026-07-10.

Связано: #200, #202, #204.

Контур: только `leader-crm-leads`, `leader-crm-orders`, `leader_*` и CRM v4 РА «Лидер». Объекты `nav_*`, Parket и Broker не затрагиваются.

Режим этого этапа: source-only specification and contract checks. Production Supabase не изменялся: Edge Functions не разворачивались, DDL/DML не выполнялись, RLS, grants, Auth и данные не менялись.

## Причина

UI уже использует canonical action registry `crm/v4/assets/v4/action-permissions-v1.js`, но UI-ограничение не является серверной авторизацией.

Текущее состояние:

- `leader-crm-leads` проверяет JWT и активный профиль, после чего маршрутизирует все действия без role/action проверки;
- live `leader-crm-orders v2` проверяет JWT и активный профиль, но не содержит action-level role matrix;
- GitHub source `leader-crm-orders` содержит частичную candidate-матрицу, которая ещё не развёрнута;
- candidate-матрица использует роль `production`, которой нет среди семи live ролей;
- candidate-матрица не описывает `accountant` и `contractor`;
- generic order response содержит клиентские и финансовые поля, поэтому простого разрешения `list` недостаточно без role-specific field projection.

## Канонические роли

Server-side map должен признавать только семь ролей из `leader_role_permissions`:

- `owner`;
- `admin`;
- `manager`;
- `accountant`;
- `designer`;
- `installer`;
- `contractor`.

Неизвестная, пустая или устаревшая роль должна получать `403 forbidden`.

Роль `production` не является live canonical role и не должна использоваться как разрешающая роль до отдельной миграции модели доступа.

## Базовые правила

1. JWT подтверждает личность, но не разрешение на действие.
2. Активный профиль является только первым уровнем допуска.
3. Каждое Edge action сопоставляется одному canonical permission key.
4. Проверка выполняется до любого service-role REST/RPC вызова.
5. Неизвестное действие возвращает `400 unknown_action`.
6. Известное, но запрещённое действие возвращает `403 forbidden`.
7. Ответ `403` может содержать action, role и matrix version, но не персональные данные и не секреты.
8. `owner` и `admin` получают полный административный доступ внутри этого контура.
9. Роль не должна получать больше полей, чем требуется для её задачи.
10. Любое privileged write должно оставлять audit event после введения серверного enforcement.

## Специальное действие profile.bootstrap

Маршрут `leader-crm-leads:ensure_profile` выполняется до active-profile check и не является обычным CRM-действием.

Permission key: `profile.bootstrap`.

Разрешение:

- любой пользователь с валидным Supabase Auth JWT может запросить создание или чтение собственного профиля;
- новый профиль создаётся только как `role=manager`, `is_active=false`;
- пользователь не может через этот маршрут назначить роль, активировать себя или изменить чужой профиль;
- существующему профилю разрешается синхронизировать только собственный email;
- owner/admin activation остаётся отдельным защищённым процессом.

## Action map: leader-crm-leads

| Edge action | Canonical permission | owner/admin | manager | accountant | designer | installer | contractor |
|---|---|---:|---:|---:|---:|---:|---:|
| `ensure_profile` | `profile.bootstrap` | special | special | special | special | special | special |
| `dashboard` | `leads.read` | allow | allow | deny | deny | deny | deny |
| `list` | `leads.read` | allow | allow | deny | deny | deny | deny |
| `list_orders` | `orders.read` | allow | allow | allow | deny | deny | deny |
| `create` | `leads.create` | allow | allow | deny | deny | deny | deny |
| `update` | `leads.update` | allow | allow | deny | deny | deny | deny |
| `ensure_client` | `clients.write` | allow | allow | deny | deny | deny | deny |
| `create_order` | `orders.create` | allow | allow | deny | deny | deny | deny |
| `create_order_from_offer` | `orders.create` | allow | allow | deny | deny | deny | deny |

### Дополнительные ограничения leader-crm-leads

- `dashboard` и `list` не должны возвращать лиды restricted production roles.
- `list_orders` обязан использовать role-specific field projection.
- Для `manager` запрещены `contractor_cost`, `profit`, внутренние финансовые поля и служебный JSON заказа.
- Для `accountant` разрешены необходимые финансовые поля, но не полный payload лида или внутренние производственные комментарии.
- `create_order` должен быть заменён transaction-backed command до признания маршрута окончательно безопасным.
- `create_order_from_offer` продолжает делегировать атомарную операцию в `leader_create_order_from_offer_rpc`.

## Action map: leader-crm-orders

| Edge action | Canonical permission | owner/admin | manager | accountant | designer | installer | contractor |
|---|---|---:|---:|---:|---:|---:|---:|
| `list` | `orders.read` | allow | allow | allow | deny | deny | deny |
| `update` basic order fields | `orders.update` | allow | allow | deny | deny | deny | deny |
| `update.payment_status` | `finance.write` | allow | deny | allow | deny | deny | deny |
| `update.layout_status` | `design.write` | allow | allow | deny | deny* | deny | deny |
| `update.layout_comment` | `design.write` | allow | allow | deny | deny* | deny | deny |
| `update.production_status` | `production.write` | allow | allow | deny | deny | deny | deny* |
| `update.deadline` | `orders.update` | allow | allow | deny | deny | deny | deny |

`deny*` означает: роль должна работать через отдельный design/production/installation job endpoint или узкую RLS-проекцию, а не через generic order service-role endpoint. Generic update возвращает слишком широкий order payload и не должен использоваться как обход job-level модели.

### Field-level правила update

- `owner/admin`: разрешены все утверждённые update-поля.
- `manager`: `status`, `layout_status`, `production_status`, `layout_comment`, `deadline`; `payment_status` запрещён.
- `accountant`: только `payment_status` через `finance.write`.
- `designer`, `installer`, `contractor`: generic `leader-crm-orders:update` запрещён.
- Пустой update без разрешённых полей должен возвращать `400 no_update_fields`, а не успешный ответ.
- Неизвестное поле не должно попадать в PATCH payload.

## Role-specific field projections

### owner/admin

Полный утверждённый набор CRM-полей, включая финансовые и внутренние поля.

### manager

Клиентская и операционная часть заказа без себестоимости, прибыли, внутренних финансовых заметок и полного `data` JSON.

### accountant

Идентификатор заказа, номер, клиентский итог, оплаты, баланс, статус оплаты, расходы и необходимые даты. Не возвращать полный lead payload, production event email и внутренние дизайн/монтажные комментарии.

### designer / contractor / installer

Generic orders list запрещён. Использовать только job-specific tables/endpoints с минимальным набором полей и соответствующей RLS.

## Рекомендуемая серверная реализация

1. Создать server-owned registry с теми же canonical keys, что и `CRM_V4_ACTIONS`.
2. Ввести `ROLE_ACTIONS` для семи canonical roles.
3. Ввести `ACTION_PERMISSION` для каждого маршрута Edge Function.
4. После `checkUser` вызвать `requireAction(profile, permission)` до service-role REST/RPC.
5. Для `update` вычислять permission по каждому изменяемому полю.
6. Формировать SELECT projection по роли.
7. Возвращать `403` до чтения или изменения бизнес-данных.
8. Добавить matrix version в отказ и внутренний audit event.
9. Не импортировать browser JS registry внутрь Edge Function; генерировать обе стороны из одного declarative source либо проверять их CI-контрактом.

Минимальный отказ:

```json
{
  "error": "forbidden",
  "action": "update",
  "permission": "finance.write",
  "role": "manager",
  "matrix": "leader-rbac-v1"
}
```

## Positive integration tests

- owner/admin выполняют все перечисленные actions;
- manager читает и изменяет лиды, создаёт клиента и заказ;
- manager изменяет order status/deadline, но не payment status;
- accountant читает разрешённую order/finance projection и изменяет только payment status;
- `ensure_profile` создаёт pending profile для нового authenticated user;
- разрешённый action сохраняет текущий функциональный результат.

## Negative integration tests

- inactive profile получает `403 access_denied` до action check;
- unknown role получает `403 forbidden`;
- accountant не читает leads и не создаёт order;
- manager не изменяет `payment_status`;
- designer/installer/contractor не вызывают generic orders list/update;
- restricted role не получает client phone, costs, profit, internal comments или order data JSON через service-role response;
- неизвестный action возвращает `400 unknown_action`;
- запрещённый action не создаёт REST/RPC запрос к бизнес-таблице;
- direct browser table operations остаются ограничены RLS и не полагаются на UI.

## Source/live drift, который нужно устранить до deploy

- live `leader-crm-orders v2` не содержит candidate role matrix из GitHub source;
- GitHub candidate использует неканоническую роль `production`;
- GitHub candidate разрешает generic list restricted roles и возвращает слишком широкий order projection;
- `leader-crm-leads` не содержит action-level enforcement;
- browser canonical registry и Edge candidate пока не связаны CI-проверкой полного соответствия.

GitHub source нельзя автоматически считать deployed production state.

## Порядок внедрения

1. Зафиксировать эту спецификацию и автоматическое покрытие action routes.
2. Подготовить declarative server registry и unit-style source checks.
3. Создать Supabase development branch после подтверждения стоимости.
4. Развернуть candidate Edge Functions только в development branch.
5. Выполнить positive/negative role matrix тесты отдельными тестовыми пользователями.
6. Проверить role-specific response fields через Network evidence.
7. Проверить, что запрещённые actions не вызывают service-role REST/RPC.
8. Подготовить rollback на текущие версии `leader-crm-leads v12` и `leader-crm-orders v2`.
9. Получить явное production approval.
10. Развернуть Edge Functions и только затем ужесточать связанные RLS policies.

## Acceptance criteria

- каждый action обеих Edge Functions имеет canonical permission;
- все семь live roles явно описаны;
- неизвестные роли fail closed;
- manager не получает finance.write;
- accountant не получает leads.write или orders.create;
- restricted production roles не используют generic order service-role endpoint;
- field-level update проверяется до PATCH;
- role-specific SELECT projection исключает лишние данные;
- positive/negative tests проходят на development branch;
- GitHub source SHA и deployed Edge SHA фиксируются в release evidence;
- production Supabase не меняется без отдельного approval.

## Rollback

- сохранить предыдущие deployed Edge versions;
- при регрессии вернуть предыдущую function version;
- не ослаблять RLS отдельно от отката Edge logic;
- сохранить тестовые evidence без персональных данных;
- повторно проверить owner/admin/manager login и основные CRM actions.
