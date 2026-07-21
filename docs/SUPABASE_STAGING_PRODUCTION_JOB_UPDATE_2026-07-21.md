# Атомарное обновление производственного задания на staging

Дата: 21 июля 2026 года.

## Проблема

Карточка `production-job-card-v2.js` пока сохраняет изменения тремя независимыми browser-запросами:

1. обновляет `leader_production_jobs`;
2. синхронизирует `leader_orders`;
3. добавляет `leader_production_events`.

При ошибке между шагами задание, заказ и история могут расходиться. UI-проверка переходов статуса уменьшает риск ошибочного выбора, но не обеспечивает транзакцию.

## Реализованный staging-контур

Только в проекте `otulfnouybahfnsycxqn` развёрнуты:

- migration `20260721141942 staging_production_job_update_rpc_20260721`;
- RPC `public.leader_update_production_job_rpc(jsonb)`;
- Edge Function `leader-crm-production v1`;
- `verify_jwt=true`;
- deployment SHA-256 `f378dc44bae1c4dd5627d2c0068f28b1c3cebe9d5e9b3e18ac01d55d59af060d`.

Production-проект: `ofewxuqfjhamgerwzull`. В нём этот RPC и Edge Function не разворачивались.

## Порядок авторизации

Edge выполняет проверки строго до бизнес-записи:

1. exact staging project guard;
2. платформенный `verify_jwt=true`;
3. проверка пользователя через `/auth/v1/user`;
4. строгая валидация envelope, payload и patch;
5. service-role-only `leader_actor_has_crm_action_rpc` с `production.write`;
6. вызов service-role-only transactional RPC.

RPC повторно проверяет `production.write` через private canonical matrix. Browser role, actor ID, timestamps, стоимость и другие server-owned поля не принимаются.

## Field-level права

Canonical `production.write` разрешает обычное обновление owner, admin, manager, designer и contractor.

Поле `internal_comment` требует дополнительное canonical permission `orders.update`. Поэтому его могут изменять owner, admin и manager. Contractor и designer не получают доступ к внутреннему комментарию даже при наличии `production.write`.

Accountant, installer, inactive profile и unknown role блокируются.

## Payload

Обязательный envelope:

- `action=production_job.update`;
- UUID `request_id`;
- `expected_updated_at`;
- `payload`.

Payload:

- UUID `job_id`;
- `idempotency_key` до 160 символов;
- непустой `patch`.

Разрешённые поля patch:

- `title`;
- `production_status`;
- `layout_status`;
- `priority`;
- `deadline`;
- `file_url`;
- `technical_task`;
- `contractor_comment`;
- `internal_comment`.

`updated_at`, статусы-временные метки, связи, actor, owner, стоимость и суммы вычисляются или загружаются сервером.

## Транзакция

Одна RPC-команда атомарно:

- блокирует производственное задание `FOR UPDATE`;
- проверяет `expected_updated_at`;
- блокирует связанный заказ;
- валидирует canonical transition;
- назначает server timestamp;
- обновляет задание;
- синхронизирует заказ;
- создаёт событие;
- сохраняет idempotency receipt;
- возвращает privacy-safe projection.

При любой ошибке все изменения откатываются. Browser compensating DELETE не используется.

## Статусы

Server registry синхронизирован с `status-transitions-v1.js`.

Legacy aliases:

- `Передано в производство` → `В очереди`;
- `В работе` → `В производстве`;
- `Проблема` → `Приостановлено`.

Неизвестный текущий статус можно только сохранить без изменения. Неизвестный target и запрещённый/terminal transition отклоняются с `invalid_transition`.

## Idempotency и concurrency

- одинаковый key и одинаковый payload возвращают исходный успех с `idempotent_replay=true`;
- одинаковый key и другой payload возвращают conflict;
- повторное использование request ID с другим key возвращает `duplicate_request`;
- stale `expected_updated_at` возвращает conflict;
- неуспешная команда не сохраняет receipt.

## Safe response

Ответ содержит только клиентски безопасные поля задания, синхронизированного заказа и одного события.

Не возвращаются:

- `internal_comment`;
- `contractor_cost`;
- `client_total`;
- `owner_id`;
- `created_by`;
- `created_by_email`.

## Acceptance

Транзакционный тест `20260721_production_job_update_acceptance.sql` подтвердил:

- manager success;
- contractor success для обычного производственного комментария;
- запрет contractor на `internal_comment`;
- deny для accountant, installer, inactive и unknown role;
- job/order/event synchronization;
- server timestamp;
- exact replay без дублей;
- idempotency conflict;
- stale conflict;
- invalid transition;
- safe response allowlist;
- принудительный failure на INSERT события;
- полный rollback job, order, event и receipt после failure.

После финального `ROLLBACK`: synthetic profiles, orders, jobs, events и receipts — `0`.

## Edge postflight

Management API повторно прочитал deployment:

- slug `leader-crm-production`;
- version `1`;
- status `ACTIVE`;
- `verify_jwt=true`;
- SHA-256 `f378dc44bae1c4dd5627d2c0068f28b1c3cebe9d5e9b3e18ac01d55d59af060d`;
- source совпадает с GitHub branch.

Edge logs после deploy пусты: boot error не зарегистрирован.

Authenticated HTTP E2E пока не выполнен, потому что временный staging Auth user не создавался.

## UI boundary

Рабочая CRM пока не переключена на новую команду:

- production config указывает на production Supabase;
- `production-job-card-v2.js` не импортирует staging transport;
- browser action не вызывает staging Edge;
- production UI остаётся неизменным до authenticated staging smoke test и отдельного решения о rollout.

## Rollback

Application-first rollback:

1. не подключать или отключить browser action;
2. при необходимости повторно развернуть проверенную Edge-версию;
3. закрытые staging RPC/table objects можно оставить без browser grants;
4. удаление или изменение бизнес-данных не требуется.

Для v1 предыдущей Edge-версии нет.

## Production boundary

Не выполнялись:

- production Edge deploy;
- production migration или RPC;
- production RLS/grants/functions changes;
- Auth user creation;
- изменения Storage или secrets;
- создание или изменение рабочих заданий, заказов и событий.

Production rollout требует отдельного explicit approval, production-specific migration/rollback plan и authenticated role smoke test.
