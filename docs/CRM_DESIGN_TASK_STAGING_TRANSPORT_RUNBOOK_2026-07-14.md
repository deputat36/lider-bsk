# Staging transport и authenticated E2E дизайн-задачи — 2026-07-14

## Фактический статус

- staging: `otulfnouybahfnsycxqn`;
- production: `ofewxuqfjhamgerwzull`;
- `leader-crm-design v1` — `ACTIVE`, `verify_jwt=true`;
- unauthenticated POST подтверждён: HTTP 401, `UNAUTHORIZED_NO_AUTH_HEADER`;
- RPC, private receipt и unique active-task index присутствуют только в staging;
- safe staging read-path применён и проверен;
- staging business counts после проверки — 0;
- production Edge/RPC/receipt/index отсутствуют, production design rows — 0.

Authenticated positive E2E не выполнен: подключённый инструмент не предоставляет безопасный lifecycle отдельного staging Auth user. SQL role simulation нельзя выдавать за реальный HTTP/browser E2E.

## Source transport

`design-task-staging-transport-v1.js`:

- работает только при точном staging project ref;
- использует текущую сессию `supabaseClient`;
- вызывает только `leader-crm-design`;
- не отправляет actor, author, owner, status, designer, source, контакты клиента, финансы и внутренние комментарии;
- формирует UUID request_id;
- сохраняет детерминированный idempotency key;
- различает create, replay, validation, forbidden, stale order, active-task conflict, idempotency conflict и persistence failure;
- после успеха вызывает safe staging read-path.

Рабочая CRM продолжает указывать на production, поэтому production-кнопка остаётся отключённой.

## safe staging read-path — выполнено

Migration:

`supabase/staging-migrations/20260714_03_design_task_read_path.sql`

Contract:

`contracts/design-task-staging-read-path-v1.json`

Browser получает только column-level SELECT к:

- `leader_orders`;
- `leader_lead_needs`;
- `leader_design_tasks`.

RLS требует:

- действующий `auth.uid()`;
- активный `leader_user_profiles`;
- canonical `design.read`;
- роль owner, admin, manager или designer.

Accountant, installer, contractor, inactive manager, unknown role и запрос без `auth.uid()` fail closed.

Не выдаются:

- клиентские контакты;
- финансовые поля;
- production status;
- внутренние комментарии и task text;
- author/owner fields;
- browser INSERT, UPDATE, DELETE;
- receipt SELECT;
- direct RPC EXECUTE.

SQL validation подтвердила positive/negative роли, safe projections, private-column denial, write denial и cleanup. Security и performance advisors не имеют WARN/ERROR по staging `leader_*`.

## Оставшийся authenticated positive E2E

Для полноценной проверки требуется отдельный временный staging Auth user, созданный через Dashboard или Admin API. Нельзя использовать production identity или реальные данные.

После создания пользователя:

1. Создать активный staging-профиль manager.
2. Создать синтетические lead, order и need с `need_design=true`.
3. Войти в отдельную staging-сборку CRM.
4. Открыть preview и подтвердить safe read-path.
5. Выполнить create: HTTP 201, `idempotent_replay=false`.
6. Выполнить exact replay: HTTP 200, `idempotent_replay=true`.
7. Изменить payload при прежнем idempotency key: HTTP 409.
8. Проверить stale order и active-task conflict: HTTP 409.
9. Проверить accountant, inactive manager и unknown role: HTTP 403.
10. Подтвердить ровно одну task, один event и один successful receipt.
11. Подтвердить неизменность workflow, production, payment, finance и client fields заказа.
12. Подтвердить read-after-success через обычную browser session.
13. Удалить все synthetic business rows, staging profile и временного Auth user.
14. Подтвердить business counts = 0, environment guard = 1 и повторно запустить advisors.

## Network evidence

В DevTools должны быть зафиксированы:

- запрос только к staging `leader-crm-design`;
- request envelope только из `action`, `request_id`, `expected_updated_at`, `payload`;
- отсутствие browser actor/status/designer/client/finance/internal fields;
- после успеха только SELECT к трём разрешённым таблицам;
- отсутствие browser writes и direct RPC calls.

## Production rollout

Production rollout запрещён без отдельного явного решения владельца. Нельзя переносить staging Auth user, fixtures, RPC, receipt, index, Edge Function, RLS/grants/policies или включать рабочую кнопку в production.
