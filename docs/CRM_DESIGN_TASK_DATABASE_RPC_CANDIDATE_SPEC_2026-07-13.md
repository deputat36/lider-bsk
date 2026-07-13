# Database/RPC candidate for `design_task.create_from_order`

Дата: 2026-07-13.

Связано: #200, #202, #204, #205, #226 и merged PR #266.

Статус: `source_only_not_deployable`.

Mode: architecture specification only. No migration file was created, no Supabase development branch was created and no production Supabase change was applied.

Машиночитаемый источник:

`contracts/design-task-database-rpc-candidate-v1.json`

Исходный server contract:

`contracts/design-task-create-from-order-v1.json`

## Результат этапа

Этот документ переводит общий server contract в проверяемую database/RPC архитектуру:

`Edge JWT + server RBAC → service-role-only RPC → private receipt → order lock → active-task uniqueness → task + event + receipt in one transaction`.

Документ не является готовой migration и не должен копироваться напрямую в production SQL.

## Почему migration пока не создана

Issue #226 прямо запрещает DDL/DML, migration, RPC deploy, RLS/grant changes и backfill без отдельного разрешения.

В проекте уже применяется безопасный шаблон: approval-gated database candidate сначала фиксируется как non-executable specification, затем реальная migration генерируется и проверяется только в Supabase development branch после подтверждения стоимости.

Поэтому на этом этапе:

- нет файла в `supabase/migrations`;
- нет SQL, применённого через `execute_sql` или `apply_migration`;
- нет новой development branch;
- нет RPC или Edge deploy;
- нет изменения policy, grant, default privilege или данных.

## Live Supabase baseline

Read-only аудит production project `ofewxuqfjhamgerwzull` подтвердил:

- Postgres `17.6.1.121`;
- schema `leader_private` существует;
- extension `pgcrypto` установлена в schema `extensions`;
- `leader_design_tasks` — 0 строк;
- `leader_design_task_events` — 0 строк;
- `leader_design_task_comments` — 0 строк;
- заказов с подтверждённой design-потребностью без design task — 2;
- `leader_private.leader_command_receipts` отсутствует;
- partial unique index активной design task отсутствует;
- `public.leader_create_design_task_from_order_rpc(jsonb)` отсутствует;
- live Edge Functions остаются `leader-crm-leads v12` и `leader-crm-orders v2`.

Текущие RLS policies design-таблиц разрешают действия любому активному профилю и не проверяют granular `design.write`.

Default privileges требуют явной защиты каждого нового объекта: для объектов, создаваемых ролью `supabase_admin`, live defaults всё ещё могут выдавать права `anon` и `authenticated`. Candidate migration обязана выполнять явные `REVOKE`, а не надеяться на defaults.

## Решение 1 — private receipt storage

Логическое имя из server contract:

`leader_command_receipts`

Физическое размещение candidate v1:

`leader_private.leader_command_receipts`

Receipt является внутренним инфраструктурным объектом и не нужен браузеру или Data API. Размещение в `leader_private` уменьшает публичную API-поверхность.

### Candidate columns

- `id uuid primary key default gen_random_uuid()`;
- `action text not null`;
- `idempotency_key text not null`;
- `request_id uuid not null`;
- `request_hash text not null`;
- `actor_id uuid not null`;
- `state text not null default 'in_progress'`;
- `response jsonb null`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`;
- `completed_at timestamptz null`.

### Receipt constraints

Обязательны:

- unique `(action, idempotency_key)`;
- unique `(action, request_id)`;
- `state in ('in_progress', 'success')`;
- длина `action` от 1 до 120;
- длина `idempotency_key` от 1 до 220;
- `request_hash` — lowercase SHA-256 hex, ровно 64 символа;
- `success` требует JSON object в `response`;
- `success` требует `completed_at`;
- browser DELETE отсутствует;
- retention policy принимается отдельно перед production.

### Receipt access

Candidate migration обязана:

- включить RLS как defense in depth;
- не создавать policies для `anon` или `authenticated`;
- revoke all table privileges from `PUBLIC`, `anon`, `authenticated`;
- grant только `SELECT`, `INSERT`, `UPDATE` роли `service_role`;
- не grant `DELETE` приложению;
- явно grant schema `USAGE` только там, где это требуется.

## Решение 2 — одна активная design task на заказ

Candidate index:

`leader_design_tasks_one_active_per_order_uidx`

Таблица:

`public.leader_design_tasks`

Unique key:

`order_id`

Predicate:

`order_id IS NOT NULL AND task_status NOT IN ('Завершено','Отменено')`

Это правило намеренно fail closed:

- `Новая`, `В работе`, `На согласовании`, `На доработке`, `Согласовано` считаются активными;
- `Согласовано` остаётся активным до `Завершено`;
- любой unknown raw status считается активным;
- status с опечаткой, лишним пробелом или другим регистром не считается terminal автоматически;
- terminal только точные canonical labels `Завершено` и `Отменено`.

Application-only `SELECT before INSERT` не защищает от concurrent requests. Нужна database-level uniqueness.

Перед созданием index development migration обязана выполнить preflight duplicate query. Если обнаружены два активных ряда одного `order_id`, migration должна остановиться без автоматического удаления или переписывания данных.

Обычная transactional migration не должна использовать `CREATE INDEX CONCURRENTLY`, поскольку эта команда несовместима с transaction block. Для текущего нулевого объёма design tasks обычный unique index допустим только после dev-branch проверки и отдельного production approval.

## Решение 3 — RPC как `SECURITY INVOKER`

Candidate identity:

`public.leader_create_design_task_from_order_rpc(p_payload jsonb)`

Candidate attributes:

- `RETURNS jsonb`;
- `LANGUAGE plpgsql`;
- `SECURITY INVOKER`;
- `SET search_path = ''`;
- все объекты внутри функции schema-qualified;
- EXECUTE revoked from `PUBLIC`, `anon`, `authenticated`;
- EXECUTE granted only to `service_role`.

Почему не `SECURITY DEFINER`:

- Edge Function всё равно вызывает RPC с server secret/service-role контекстом;
- `service_role` уже является привилегированным trusted caller;
- `SECURITY INVOKER` не создаёт дополнительный privilege-escalation слой;
- Supabase advisors отдельно предупреждают о `SECURITY DEFINER`, доступных `anon` или `authenticated`;
- public `SECURITY DEFINER` требует более сложного доказательства безопасности.

RPC остаётся в `public`, потому что PostgREST RPC route должен быть доступен Edge Function. Но ACL делает route service-role-only.

## Edge/RPC trust boundary

Browser не вызывает RPC напрямую.

Будущая authenticated Edge Function обязана:

1. проверить JWT;
2. получить user ID из JWT;
3. загрузить активный профиль;
4. проверить `design.write` до business reads;
5. удалить любой browser-supplied `actor_id`;
6. добавить trusted `actor_id` и при необходимости `actor_email`;
7. вызвать service-role-only RPC;
8. повторно project safe response перед возвратом браузеру.

RPC получает:

- trusted `actor_id`;
- optional trusted `actor_email`;
- исходный request envelope в поле `request`.

RPC повторно проверяет active profile и роль. Browser-supplied actor, author или status не доверяется.

## Canonical `design.write` roles

Текущий canonical source `action-permissions-v1.js` разрешает `design.write`:

- `owner`;
- `admin`;
- `manager`;
- `designer`.

Запрещены:

- `accountant`;
- `installer`;
- `contractor`;
- пустая или неизвестная роль.

Candidate checker обязан сравнивать этот список с canonical registry. Роль нельзя расширить только в SQL без синхронного изменения source registry и review.

## Request hash

Hash вычисляется server-side.

Algorithm:

`SHA-256` через `extensions.digest`.

Перед hashing RPC:

- валидирует allowed fields;
- отклоняет unknown fields;
- нормализует request;
- сортирует `need_ids`;
- формирует canonical JSONB;
- не включает raw JWT, secret, client phone, finance или полный `order.data`.

Hash включает:

- action;
- request ID;
- expected order timestamp;
- order ID;
- optional production job ID;
- sorted need IDs;
- allowed task fields.

## Nonblocking duplicate protection

Receipt row внутри одной транзакции не виден другим транзакциям до commit. Поэтому одного `state=in_progress` недостаточно для немедленного ответа на параллельный запрос.

Candidate использует transaction-scoped advisory lock:

`pg_try_advisory_xact_lock(hashtextextended(action || ':' || idempotency_key, 0))`

Поведение:

- lock получен → продолжить;
- lock уже удерживается → `duplicate_request`;
- lock освобождается автоматически при commit/rollback;
- advisory lock не заменяет durable receipt;
- unique receipt key остаётся окончательной защитой.

## Transaction algorithm

Порядок является частью контракта:

1. ACL допускает только `service_role`.
2. Проверить RPC envelope и action.
3. Загрузить actor profile и потребовать `is_active=true`.
4. Проверить canonical `design.write` role.
5. Нормализовать request и вычислить request hash.
6. Получить nonblocking advisory lock.
7. Зарезервировать или прочитать receipt.
8. При same key + same hash + success вернуть stored safe response.
9. При same key + different hash вернуть `conflict`.
10. Заблокировать order `FOR UPDATE`.
11. Проверить `expected_updated_at`.
12. Отклонить archived, terminal или unknown order status.
13. Загрузить все need IDs и подтвердить связь с `order.lead_id`.
14. Потребовать `need_design=true`.
15. Отклонить archived/cancelled needs.
16. Проверить optional production job.
17. Заблокировать существующие design tasks заказа `FOR UPDATE`.
18. Unknown task status считать active conflict.
19. Любую nonterminal task, включая approved, считать active conflict.
20. Вставить server-owned design task.
21. Вставить privacy-safe creation event.
22. Сформировать safe projection.
23. Сохранить safe projection в receipt и установить `success`.
24. Commit.

Task, event и receipt должны быть одной database transaction.

## Server-owned insert

RPC устанавливает самостоятельно:

- `task_status = 'Новая'`;
- `layout_status = 'Макет не начат'`;
- `designer_name = null`;
- `layout_link = null`;
- `source = 'crm_v4_server_action'`;
- `owner_id = actor_id`;
- `created_by = actor_id`;
- `updated_by = null`.

Browser task payload разрешает только:

- title;
- priority;
- deadline;
- task text;
- reference link.

## Atomic audit

Event target:

`public.leader_design_task_events`

Creation event:

- `event_type = 'created'`;
- `old_status = null`;
- `new_status = 'Новая'`;
- `created_by = actor_id`;
- body содержит только короткое privacy-safe описание.

Если event insert падает, task и receipt откатываются.

Если receipt completion падает, task и event откатываются.

Best-effort audit запрещён.

## Safe response and receipt payload

Receipt хранит только safe response projection, а не raw database row.

Запрещены:

- client name;
- client phone;
- client total;
- contractor cost;
- profit, balance, prepayment;
- payment status;
- internal/client comments;
- owner/created/updated IDs;
- order data JSON;
- raw JWT;
- service key;
- SQL error details;
- stack trace.

## Concurrency matrix

### Same idempotency key, same hash

Один запрос создаёт task. Повтор возвращает сохранённую safe projection с `idempotent_replay=true`.

### Same key, different hash

Возвращается `conflict`. Новая task не создаётся.

### Same key concurrently

Один запрос получает advisory lock. Второй получает `duplicate_request` либо safe replay после завершения retry. Duplicate task невозможна.

### Different keys, same order concurrently

Order row lock и partial unique index допускают максимум одну active task. Проигравший запрос получает `conflict`, а его receipt/task/event откатываются.

### Different keys after terminal task

После exact terminal `Завершено` или `Отменено` новая логическая task разрешена только с новым idempotency key.

## Migration preflight

Перед генерацией реальной migration обязательно:

1. Подтвердить стоимость Supabase development branch.
2. Создать/rebase development branch.
3. Повторно прочитать live schema, grants, policies, functions, extensions и default ACL.
4. Проверить schema `leader_private` и `service_role USAGE`.
5. Проверить `extensions.digest`.
6. Проверить отсутствие target receipt table и RPC.
7. Проверить отсутствие нескольких active tasks на один order.
8. Инвентаризировать unknown raw task statuses.
9. Сгенерировать migration текущим Supabase CLI/process, а не копированием этой спецификации.
10. Запустить branch-only fixtures и tests.

## Development-branch tests

Обязательны:

- receipt находится в `leader_private`;
- RLS receipt включён;
- direct browser policies отсутствуют;
- PUBLIC/anon/authenticated table privileges отсутствуют;
- RPC `SECURITY INVOKER`;
- RPC search path пустой;
- PUBLIC/anon/authenticated EXECUTE отсутствует;
- service_role EXECUTE присутствует;
- inactive actor denied;
- unknown role denied;
- accountant/installer/contractor denied;
- owner/admin/manager/designer positive cases;
- browser actor/status/author/source rejected;
- stale order rejected;
- unknown order status rejected;
- foreign/non-design need rejected;
- wrong production relation rejected;
- unknown/approved active task blocks creation;
- completed/cancelled previous task permits new task with new key;
- same-key idempotency;
- hash mismatch conflict;
- concurrent same-key test;
- concurrent different-key same-order test;
- forced event failure rollback;
- forced receipt completion failure rollback;
- no order/payment/layout/production side effects;
- no privacy leakage in response or receipt;
- Supabase security/performance advisors;
- rollback rehearsal.

## Rollback strategy

Стратегия:

`application_first_keep_data`

### Application rollback

1. Отключить или откатить Edge route.
2. Убедиться, что RPC больше не вызывается.
3. Revoke service_role EXECUTE.
4. Оставить receipt table и active-task index на месте, пока возможны retries.

### Schema rollback

Требует отдельного approval:

1. Сохранить receipt evidence согласно retention decision.
2. Drop RPC после проверки callers.
3. Drop active-task index только после review duplicate risk.
4. Drop receipt table только когда idempotency history больше не нужна.

Автоматический rollback никогда не удаляет созданные design tasks или audit events.

## Approval gates

Отдельное разрешение требуется для:

- подтверждения стоимости development branch;
- создания development branch;
- генерации migration;
- применения migration;
- создания RPC;
- Edge route и deploy;
- hardening существующих design RLS/grants;
- production rollout;
- backfill двух текущих заказов;
- schema rollback.

## Supabase security references

Проверено по актуальным Supabase docs:

- RLS должен быть включён на объектах exposed schemas;
- private schema предпочтительна для внутренних security objects;
- `SECURITY DEFINER` в exposed schema создаёт privilege-escalation риск;
- function EXECUTE по умолчанию может быть доступен `PUBLIC`, поэтому explicit REVOKE обязателен;
- advisor lint `0029_authenticated_security_definer_function_executable` требует отдельно проверять authenticated EXECUTE.

## Production boundary

На этом этапе:

- No production DDL or DML was executed.
- No migration file was created.
- No development branch was created.
- No RPC or Edge Function was deployed.
- No RLS, grant, policy, Auth, Storage or business data was changed.
- No current order was backfilled.
- No `nav_*`, `nav-*`, Parket or Broker object was changed.
