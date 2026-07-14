# Staging transport и authenticated E2E дизайн-задачи — 2026-07-14

## Фактический статус

- staging: `otulfnouybahfnsycxqn`;
- production: `ofewxuqfjhamgerwzull`;
- `leader-crm-design v1` в staging имеет статус `ACTIVE` и `verify_jwt=true`;
- внешний запрос без `Authorization` подтверждён: HTTP `401`, `sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER`;
- staging RPC, private receipt и unique active-task index присутствуют;
- staging profiles/orders/needs/tasks/events/receipts после проверки — 0;
- production Edge/RPC/receipt/index отсутствуют, production design tasks/events/comments — 0.

Authenticated positive E2E не выполнен. Подключённый Supabase-инструмент не умеет безопасно создавать и удалять Auth users, а в staging нет отдельного тестового пользователя. Успех нельзя имитировать SQL-вставкой в `auth.users` или production JWT.

## Что подготовлено в source

`design-task-staging-transport-v1.js`:

- разрешает вызов только при точном project ref `otulfnouybahfnsycxqn`;
- использует текущую сессию `supabaseClient.auth.getSession()`;
- вызывает только `leader-crm-design` через `supabaseClient.functions.invoke()`;
- не принимает и не отправляет actor, author, owner, status, designer, source, контакты клиента, финансы и внутренние комментарии;
- формирует UUID `request_id` через `crypto.randomUUID()`;
- сохраняет детерминированный idempotency key из черновика;
- различает create, replay, validation error, forbidden, stale order, active task conflict, idempotency conflict и persistence failure;
- после успеха вызывает переданный safe staging read-path.

Текущий `crm/v4/assets/v4/config.js` продолжает указывать на production. Поэтому рабочая CRM показывает только `Создать задачу в CRM — отключено`, а transport не выполняет сетевой вызов.

## Оставшийся safe staging read-path gate

Изолированный staging harness намеренно не выдаёт `authenticated` прямой `SELECT` к `leader_orders`, `leader_lead_needs` и `leader_design_tasks`; RLS включён без browser policies. Поэтому существующий preview ещё нельзя открыть под staging Auth, а post-create перечитывание нельзя считать доказанным.

Перед browser E2E нужен отдельный staging-only этап:

1. Зафиксировать минимальные `SELECT` projections для заказа, design-потребности и design task.
2. Добавить RLS policies только для активного staging-профиля с canonical `design.read`.
3. Синхронизировать разрешённые роли с `action-permissions-v1.js` checker-ом.
4. Не выдавать `INSERT`, `UPDATE`, `DELETE` или RPC EXECUTE browser-ролям.
5. Проверить отрицательные сценарии для inactive, accountant, installer, contractor и unknown role.
6. После DDL запустить security/performance advisors.

До этого safe staging read-path не выполнен и не должен объявляться пройденным.

## Точный authenticated E2E после снятия двух gates

### 1. Тестовый Auth user

Создать только в staging отдельного пользователя через Supabase Dashboard или Admin API:

- адрес явно тестовый, не совпадает с сотрудниками и клиентами;
- пароль генерируется на время теста и не попадает в GitHub, issue, логи или скриншоты;
- production Auth не используется;
- сохранить только UUID пользователя в локальной временной заметке.

Создать в staging `leader_user_profiles` активный профиль с ролью `manager`. Не использовать production UUID, email, телефоны или реальные имена.

### 2. Синтетические fixtures

Создать только в staging:

- один lead;
- один order с нейтральным названием и фиксированным `updated_at`;
- одну lead need с `need_design=true`;
- не создавать client rows, оплаты, расходы и production данные.

Использовать `example.invalid` для любых ссылок и sentinel-строки без персональных данных.

### 3. Browser/Network create

В отдельной staging-сборке CRM:

1. Войти тестовым staging-пользователем.
2. Открыть preview синтетического заказа.
3. Убедиться, что видна кнопка `Создать тестовую задачу в staging`.
4. Проверить request body: только `action`, `request_id`, `expected_updated_at`, `payload`.
5. Проверить отсутствие actor/status/designer/client/finance/internal fields.
6. Получить HTTP `201` и `idempotent_replay=false`.
7. Подтвердить автоматическое перечитывание design task через safe staging read-path.

### 4. Replay и конфликты

- повторить точный command: HTTP `200`, `idempotent_replay=true`;
- изменить payload при том же idempotency key: HTTP `409`;
- изменить `order.updated_at` после подготовки preview: HTTP `409`, stale order;
- попытаться создать вторую active task с новой key: HTTP `409`, active task conflict.

### 5. Роли и активность

Последовательно менять только staging-профиль и обновлять JWT/session при необходимости:

- manager или designer active → разрешено;
- accountant → HTTP `403`;
- inactive manager → HTTP `403`;
- unknown role → HTTP `403`.

После каждого отрицательного сценария task/event/receipt counts не должны увеличиваться.

### 6. Инварианты

После первого create и всех повторов должно существовать ровно:

- 1 design task;
- 1 audit event;
- 1 successful receipt.

Не должны измениться order status, layout status, production status, payment status, суммы, client data и internal comments. Ответ, task, event и receipt не должны содержать контакты, финансы или внутренние комментарии.

### 7. Очистка

Удалить в staging в безопасном порядке:

1. synthetic receipt;
2. design event;
3. design task;
4. need;
5. order;
6. lead;
7. staging profile;
8. тестового Auth user через Dashboard/Admin API.

Подтвердить business counts = 0 и environment guard = 1. Удалить локальные пароль, access token, refresh token и UUID-заметки. Затем повторно запустить security/performance advisors.

## Production rollout

Production rollout запрещён без отдельного явного решения владельца. Нельзя переносить staging Auth user, fixtures, RPC, receipt, index, Edge Function, RLS/grants/policies или включать рабочую кнопку в production.
