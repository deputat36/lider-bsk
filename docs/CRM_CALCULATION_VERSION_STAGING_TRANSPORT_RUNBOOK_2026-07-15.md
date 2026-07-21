# Staging transport новой версии расчёта

Первичная версия: 15 июля 2026 года. Актуализация: 21 июля 2026 года.

## Назначение

Модуль `calculation-version-staging-transport-v1.js` подготавливает безопасный browser-вызов `calculation.create_version` через JWT-защищённую staging Edge Function.

Transport подключён к редактору только при exact staging URL. Production URL использует `production_locked`: редактор не выполняет browser write и не вызывает staging Edge Function.

Основной `calculations.js` не импортирует staging transport и не меняет существующее production-сохранение.

## Staging

- project ref: `otulfnouybahfnsycxqn`;
- exact hostname: `otulfnouybahfnsycxqn.supabase.co`;
- Edge Function: `leader-crm-calculations`;
- active version: `5`;
- deployment hash: `4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- canonical permission: `calculations.write`.

## Production lock

- production project: `ofewxuqfjhamgerwzull`;
- `V4_CONFIG.supabaseUrl` указывает на production;
- route: `production_locked`;
- `enabled=false`;
- `browserDirectWrite=false`;
- production Edge и production action не включены.

## Canonical authorization

Edge больше не содержит локальный список ролей и не читает `leader_user_profiles` напрямую для принятия решения.

Порядок:

1. exact staging environment guard;
2. `verify_jwt=true`;
3. Auth user verification;
4. строгая валидация command envelope;
5. service-role-only `public.leader_actor_has_crm_action_rpc`;
6. permission `calculations.write`;
7. transactional `leader_create_calculation_version_rpc`.

Активные owner/admin/manager разрешены canonical SQL-матрицей. Accountant, designer, installer, contractor, inactive и unknown блокируются.

## Source wiring

Редактор использует `calculationVersionPersistenceRoute(V4_CONFIG.supabaseUrl)`.

Маршруты:

- `staging_edge` — только exact hostname `otulfnouybahfnsycxqn.supabase.co`;
- `production_locked` — production URL и любой другой URL.

Fail-closed правила:

- production config не меняется;
- production route не получает сессию и не вызывает `functions.invoke`;
- production route не выполняет `.insert`, `.update`, `.delete` или `.upsert`;
- staging transport не использует table write, browser RPC или compensating delete;
- ошибка Edge не включает альтернативный write transport;
- production-кнопка имеет `aria-disabled=true` и текст `Новая версия — недоступно`.

## Command envelope

Browser отправляет только:

- `action`;
- `request_id`;
- `expected_updated_at`;
- `payload`.

Payload:

- `source_calculation_id`;
- `idempotency_key`;
- `title`;
- `need_id`;
- `public_comment`;
- `internal_comment`;
- `items`.

Позиция:

- `catalog_id`;
- `category`;
- `item_type`;
- `name`;
- `unit`;
- `qty`;
- `contractor_price`;
- `client_price`;
- `comment`;
- `data`;
- `sort_order`.

Не передаются actor ID, lead ID внутри позиции, calculation ID внутри позиции, version number, status, связи КП/заказа, totals, profit, markup, margin и audit fields.

## Browser flow staging

1. Проверяется exact staging hostname.
2. UI проверяет `calculations.write` для отображения действия.
3. Загружается source calculation с `updated_at`.
4. Создаётся стабильный idempotency key.
5. Строится минимальная projection.
6. Получается JWT-сессия через `client.auth.getSession()`.
7. Вызывается `client.functions.invoke('leader-crm-calculations', { body: command })`.
8. HTTP 201 означает новую версию.
9. HTTP 200 + `idempotent_replay=true` означает безопасный повтор.
10. При успехе список перечитывается; при ошибке draft сохраняется для повтора.

Transport не использует `.from(...)`, browser INSERT/UPDATE/DELETE/UPSERT, browser RPC, service role или compensating DELETE.

## Ожидаемые ответы

- 201 — новая версия;
- 200 — exact replay;
- 400 — invalid payload/items/totals;
- 401 — JWT отсутствует или недействителен;
- 403 — canonical permission denied;
- 404 — source отсутствует;
- 409 — source/idempotency/version conflict;
- 500 — permission transport или persistence unavailable.

## Rollback

- v4 — предпочтительный быстрый rollback: canonical runtime gate уже работал, но contract bundle содержал неиспользуемый legacy helper.
- v3 — исторический валидированный rollback с локальным role guard.
- v2 — запрещённый rollback из-за packaging typo.

Rollback не требует удаления бизнес-данных или изменения database schema.

## Authenticated E2E

На момент проверки staging содержит 0 Auth users. Тестовых пользователей и паролей автоматически не создавали.

authenticated HTTP E2E остаётся непроверенным. Для него владелец создаёт временного пользователя только в staging, выполняются create/replay/conflict/forbidden/inactive сценарии, после чего удаляются fixtures, profile, sessions и Auth user.

## Production boundary

Запрещены без отдельного approval:

- замена `production_locked` на Edge route;
- production migration/RPC/index;
- production Edge deployment;
- исправление production data;
- возврат browser INSERT/DELETE или compensating rollback.

Следующий gate — отдельный authenticated staging smoke test, затем production rollout plan с rollback и явным решением владельца.
