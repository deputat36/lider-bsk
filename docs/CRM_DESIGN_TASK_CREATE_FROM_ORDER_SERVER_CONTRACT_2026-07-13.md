# Server contract `design_task.create_from_order`

Дата: 2026-07-13.

Связано: #200, #202, #204, #205, #226.

Статус этапа: `source_only_not_enforced`.

Production Supabase не изменялся. DDL/DML, migrations, RLS, grants, policies, Auth, Storage, RPC и Edge Function deploy не выполнялись.

## Цель

Зафиксировать безопасный серверный контракт создания дизайн-задачи из заказа и подтверждённых потребностей:

`order + need_design evidence → RBAC → idempotency → transaction → design task + audit event → safe projection`.

Машиночитаемый контракт:

`contracts/design-task-create-from-order-v1.json`

Общий command registry:

`contracts/crm-v4-backend-command-contract-v1.json`

Reference evaluator без Supabase-запросов:

`tools/design-task-create-from-order-reference-v1.mjs`

Behavior test:

`tools/test_design_task_create_from_order_contract.mjs`

## Команда

- action: `design_task.create_from_order`;
- permission: `design.write`;
- entity: `design_task`;
- canonical status domain: `design_task`;
- initial canonical status key: `new`;
- initial label: `Новая`;
- audit target: `leader_design_task_events`;
- stable audit event: `design_task.created_from_order`.

## Runtime boundary

Будущая команда обязана:

1. Принимать только authenticated user JWT.
2. Проверять активный профиль в `leader_user_profiles`.
3. Проверять canonical permission `design.write` до чтения бизнес-данных и до service-role операций.
4. Не считать наличие активного профиля достаточной авторизацией.
5. Не использовать generic `leader-crm-orders:update` для создания design task.
6. Выполнять запись через transaction-backed RPC или database function.
7. Fail closed для неизвестной роли, неизвестного action и неизвестного raw-статуса.

Последовательность отдельных service-role REST INSERT не соответствует контракту: задача, event и idempotency receipt должны коммититься или откатываться вместе.

## Standard request

```json
{
  "action": "design_task.create_from_order",
  "request_id": "11111111-1111-4111-8111-111111111111",
  "expected_updated_at": "2026-07-13T10:00:00.000Z",
  "payload": {
    "order_id": "33333333-3333-4333-8333-333333333333",
    "production_job_id": null,
    "idempotency_key": "design_task.create_from_order:33333333-3333-4333-8333-333333333333:v1",
    "need_ids": [
      "55555555-5555-4555-8555-555555555555"
    ],
    "task": {
      "title": "Дизайн №507 — макет световой вывески",
      "priority": "Высокий",
      "deadline": "2026-07-19T00:00:00.000Z",
      "task_text": "Подготовить макет по подтверждённой потребности.",
      "reference_link": null
    }
  }
}
```

`expected_updated_at` относится к `leader_orders.updated_at`.

## Client-allowed task fields

Браузер может предложить только:

- `title`;
- `priority`;
- `deadline`;
- `task_text`;
- `reference_link`.

## Server-owned fields

Сервер не доверяет браузеру и устанавливает самостоятельно:

- `task_status = Новая` из canonical `design_task.new`;
- `layout_status = Макет не начат` для совместимости с текущим live default;
- `designer_name = null`;
- `layout_link = null`;
- `source = crm_v4_server_action`;
- `owner_id = authenticated user id`;
- `created_by = authenticated user id`;
- `updated_by = null`.

Переданные браузером поля ниже должны вызывать `validation_error`, а не молча переопределять сервер:

- `task_status`;
- `layout_status`;
- `designer_name`;
- `layout_link`;
- `source`;
- `owner_id`;
- `created_by`;
- `updated_by`;
- `client_name`;
- `client_phone`;
- `client_comment`;
- `internal_comment`;
- `result_comment`.

Локальный preview из `design-task-draft-model-v1.js` остаётся визуальным draft model. Перед реальным вызовом UI adapter должен построить request по этому server contract, а не отправлять preview JSON напрямую.

## Минимальные серверные чтения

### `leader_user_profiles`

- `user_id`;
- `role`;
- `is_active`.

### `leader_orders`

- `id`;
- `order_number`;
- `lead_id`;
- `status`;
- `priority`;
- `deadline`;
- `layout_status`;
- `layout_link`;
- `is_archived`;
- `updated_at`.

### `leader_lead_needs`

- `id`;
- `lead_id`;
- `need_type`;
- `title`;
- `need_design`;
- `design_reason`;
- `deadline_date`;
- `status`;
- `completeness_score`;
- `missing_fields`;
- `updated_at`.

### `leader_production_jobs`

Только если передан `production_job_id`:

- `id`;
- `order_id`;
- `production_status`.

### `leader_design_tasks`

- `id`;
- `order_id`;
- `production_job_id`;
- `task_status`;
- `updated_at`.

Клиентские контакты, финансы, order `data`, внутренние комментарии и production costs для этой команды не читаются.

## Validation order

Порядок является частью security contract:

1. Проверить envelope, action и UUID `request_id`.
2. Подтвердить authenticated user.
3. Загрузить активный профиль.
4. Проверить `design.write`.
5. Зарезервировать idempotency receipt.
6. Заблокировать и загрузить заказ.
7. Сравнить `expected_updated_at` с `order.updated_at`.
8. Отклонить архивный, terminal или unknown order status.
9. Загрузить все `need_ids`.
10. Убедиться, что потребности относятся к `order.lead_id`.
11. Для каждой потребности потребовать `need_design=true`.
12. Отклонить архивные и отменённые потребности.
13. Проверить optional production job и его `order_id`.
14. Заблокировать существующие design tasks заказа.
15. Unknown design task status считать active conflict.
16. Отклонить создание при любой nonterminal задаче.
17. Сформировать server-owned insert payload.
18. Вставить design task.
19. Вставить event `created`.
20. Сохранить успешный idempotency response.
21. Commit.

## Need readiness

Версия v1 использует advisory policy.

Блокируют создание:

- потребность не найдена;
- потребность относится к другому lead;
- `need_design != true`;
- статус потребности архивный или отменённый.

Возвращают warnings, но не блокируют:

- `completeness_score < 80`;
- `missing_fields` не пуст;
- не заполнен `design_reason`;
- отсутствует дедлайн.

Server-side hard gate полноты потребует отдельного бизнес-решения.

## Active-task rule

Terminal design task statuses:

- `completed` / `Завершено`;
- `cancelled` / `Отменено`.

Nonterminal и блокирующие повторное создание:

- `new`;
- `in_progress`;
- `review`;
- `revisions`;
- `approved`.

`approved` остаётся активным до отдельного перехода в `completed`.

Любой неизвестный raw-статус блокирует создание как active conflict. Сервер не имеет права предполагать, что неизвестный статус terminal.

Перед production enforcement необходима database-level гарантия одной активной design task на `order_id`. Application-only SELECT перед INSERT не защищает от concurrent requests.

## Idempotency

Обязательны:

- `request_id`;
- `idempotency_key`;
- server-computed canonical request hash;
- durable receipt storage;
- уникальность `(action, idempotency_key)`.

Live-таблицы не содержат idempotency column и отдельной `leader_command_receipts` сейчас нет.

До migration idempotency contract не может считаться enforced.

Поведение:

- same key + same hash + success → вернуть сохранённую safe projection и `idempotent_replay=true`;
- same key + different hash → `conflict`;
- same request in progress → `duplicate_request`;
- failed transaction не отмечается successful;
- terminal design task не отменяет receipt старого успешно выполненного request.

Для новой логической design task после terminal предыдущей задачи требуется новый idempotency key.

## Transaction writes

В одной транзакции:

1. reserve `leader_command_receipts`;
2. INSERT `leader_design_tasks`;
3. INSERT `leader_design_task_events`;
4. persist successful response in receipt.

Если event или receipt не сохранился, task INSERT откатывается.

Best-effort audit после успешного task INSERT запрещён.

## Audit event

`leader_design_task_events`:

- `task_id` — ID созданной задачи;
- `order_id` — исходный заказ;
- `event_type = created`;
- `old_status = null`;
- `new_status = Новая`;
- `body` — короткий privacy-safe текст;
- `created_by` — authenticated user id.

Event body не содержит телефон, имя клиента, финансовые суммы, внутренние комментарии или полный текст клиентского сообщения.

## Safe success projection

```json
{
  "ok": true,
  "request_id": "uuid",
  "entity": {},
  "order": {},
  "events": [],
  "warnings": [],
  "idempotent_replay": false
}
```

Разрешённые поля `entity`:

- `id`;
- `order_id`;
- `production_job_id`;
- `title`;
- `task_status`;
- `layout_status`;
- `priority`;
- `designer_name`;
- `deadline`;
- `source`;
- `layout_link`;
- `reference_link`;
- `created_at`;
- `updated_at`.

Разрешённые поля `order`:

- `id`;
- `order_number`;
- `status`;
- `deadline`;
- `layout_status`;
- `layout_link`.

Запрещены в response:

- `client_name`;
- `client_phone`;
- `client_total`;
- `contractor_cost`;
- `profit`;
- `balance`;
- `prepayment`;
- `payment_status`;
- `internal_comment`;
- `client_comment`;
- `owner_id`;
- `created_by`;
- `updated_by`;
- `order.data`.

## Stable errors

- `access_denied` — нет активного профиля;
- `forbidden` — неизвестная роль или нет `design.write`;
- `unknown_action` — неизвестная команда;
- `validation_error` — неверный payload или design evidence;
- `not_found` — отсутствует order, need или production job;
- `conflict` — stale/archived/terminal/unknown order, active task или idempotency hash mismatch;
- `duplicate_request` — запрос с тем же ключом уже выполняется;
- `persistence_failed` — transaction не сохранила task, event и receipt вместе.

Ошибки не возвращают service key, SQL, stack trace, raw JWT, полный профиль или чувствительные поля заказа.

## Запрещённые side effects

Создание design task не должно:

- менять order status;
- менять `order.layout_status` или `order.layout_link`;
- менять production status;
- создавать или изменять production job;
- менять payment status;
- создавать payment или expense;
- закрывать или архивировать заказ;
- автоматически назначать дизайнера;
- перезаписывать согласованный макет;
- копировать клиентский телефон или финансы в design task.

Передача макета в производство остаётся отдельным действием после approved layout или явного `Не требуется`.

## Live Supabase read-only evidence

Проверено 2026-07-13 без чтения персональных и финансовых значений:

- `leader_design_tasks` — 0 строк;
- `leader_design_task_events` — 0 строк;
- `leader_design_task_comments` — 0 строк;
- активных заказов с `need_design=true` и без task — 2;
- `leader_design_tasks` содержит FK к order и production job;
- есть обычные indexes по `order_id`, `production_job_id`, `task_status`, `deadline`;
- partial unique active-task index отсутствует;
- idempotency column отсутствует;
- command receipt table отсутствует;
- current RLS разрешает SELECT/INSERT/UPDATE design tasks любому активному authenticated профилю;
- current RLS не проверяет canonical `design.write`;
- comments/events INSERT также проверяют только active profile;
- live Edge Functions остаются `leader-crm-leads v12` и `leader-crm-orders v2`;
- этот action в live Edge Functions отсутствует.

Широкие формальные table grants сами по себе не означают доступ к строкам при включённом RLS, но grant/RLS hardening должен быть отдельно проверен до production rollout.

## Reference behavior coverage

Behavior test проверяет:

- success plan;
- active profile required;
- `design.write` required;
- unknown action;
- invalid request UUID;
- stale order;
- unknown order status;
- terminal/archived order;
- order без lead;
- missing need;
- need другого lead;
- `need_design=false`;
- архивную потребность;
- missing/mismatched production job;
- active task;
- approved task как active;
- unknown task status как conflict;
- completed/cancelled task как terminal;
- browser попытку передать `task_status`;
- unknown task fields;
- duplicate need IDs;
- idempotent replay;
- in-progress duplicate;
- idempotency hash mismatch;
- advisory warnings;
- отсутствие client/finance leakage в planned writes.

Reference evaluator не выполняет Fetch, Supabase REST, RPC, INSERT, UPDATE или DELETE.

## Approval gates

Без отдельного разрешения не выполнять:

1. Supabase development branch creation.
2. Migration `leader_command_receipts`.
3. Active-task unique constraint/index.
4. Transaction-backed RPC/database function.
5. Edge Function route.
6. Deploy Edge Function.
7. Server-side RBAC enforcement в production.
8. RLS/grant/policy hardening.
9. Backfill двух текущих заказов.
10. Production deployment.

## Acceptance criteria source-only этапа

- action зарегистрирован в общем command registry;
- permission `design.write` существует в canonical action registry;
- status domain `design_task` существует;
- server-owned fields запрещены во входном task payload;
- unknown raw status fail closed;
- active-task и idempotency concurrency описаны;
- transaction и rollback обязательны;
- response projection минимизирована;
- reference behavior tests проходят;
- checker включён транзитивно в общий backend/full-audit contract;
- production Supabase не изменён.
