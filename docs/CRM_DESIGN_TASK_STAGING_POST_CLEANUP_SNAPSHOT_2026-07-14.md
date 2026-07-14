# Staging design task: post-cleanup snapshot

Дата: 2026-07-14

## Назначение

Этот пакет доказывает, что после authenticated staging E2E полностью удалены:

- временный Auth user;
- CRM-профиль;
- synthetic lead;
- synthetic order;
- synthetic need;
- production job, если он создавался;
- design task;
- design event;
- idempotency receipt.

Одновременно snapshot подтверждает, что необходимая staging-инфраструктура не была случайно удалена или расширена по правам.

## Контуры

Staging:

`otulfnouybahfnsycxqn`

Production:

`ofewxuqfjhamgerwzull`

Collector разрешено выполнять только в staging. Production boundary остаётся неизменной.

## Файлы

- контракт: `contracts/design-task-staging-post-cleanup-snapshot-v1.json`;
- read-only collector: `supabase/staging-queries/20260714_design_task_post_cleanup_snapshot.sql`;
- validator: `tools/validate-design-task-staging-post-cleanup-snapshot.mjs`;
- tests: `tools/test_design_task_staging_post_cleanup_snapshot.mjs`;
- source checker: `tools/check_design_task_staging_post_cleanup_snapshot.py`.

## Что проверяет collector

Нулевые counts:

- `auth_users`;
- `profiles`;
- `leads`;
- `orders`;
- `needs`;
- `production_jobs`;
- `design_tasks`;
- `design_events`;
- `receipts`.

Обязательный count:

- `environment_guard = 1`.

Обязательные staging-объекты:

- `leader_create_design_task_from_order_rpc(jsonb)`;
- `leader_private.leader_has_crm_action(text)`;
- unique active-design-task index;
- три SELECT policy для безопасного read-path.

Обязательные privilege-инварианты:

- `authenticated` не вызывает design RPC напрямую;
- `authenticated` не читает receipt;
- table-level SELECT к orders отсутствует;
- разрешён column-level SELECT к `orders.id`;
- `orders.client_phone` недоступен.

## Порядок применения после реального E2E

1. Выполнить cleanup в порядке, указанном fixture manifest:
   - receipt;
   - event;
   - task;
   - need;
   - order;
   - lead;
   - profile;
   - Auth user.
2. Убедиться через Supabase Dashboard, что временный Auth user удалён.
3. Выполнить read-only collector только в staging.
4. Сохранить значение поля `snapshot` в локальный файл:

   `artifacts/design-task-staging-post-cleanup-snapshot.json`

5. Запустить:

```bash
node tools/validate-design-task-staging-post-cleanup-snapshot.mjs artifacts/design-task-staging-post-cleanup-snapshot.json
```

6. Ожидаемый результат:

```json
{
  "ok": true,
  "errors": [],
  "summary": {
    "cleanup_complete": true
  }
}
```

7. Удалить локальный snapshot после фиксации агрегированного результата в issue или deployment evidence.
8. Повторно запустить security и performance advisors.

## Privacy

Snapshot содержит только:

- counts;
- boolean-признаки объектов и прав;
- project ref staging;
- timestamp.

В snapshot запрещены:

- email;
- телефон;
- пароль;
- JWT;
- publishable или service-role key;
- Authorization header;
- контакты клиента;
- финансовые данные;
- внутренние комментарии;
- production project ref.

## Текущий baseline

Read-only проверка 2026-07-14 подтвердила:

- все Auth/business counts — 0;
- environment guard — 1;
- RPC/helper/index — присутствуют;
- SELECT policies — 3;
- direct RPC и receipt SELECT для `authenticated` отсутствуют;
- table-level orders SELECT отсутствует;
- safe `orders.id` column SELECT присутствует;
- `orders.client_phone` недоступен.

Эта проверка не является authenticated E2E. Auth user не создавался, DDL/DML не выполнялись.

## Production boundary

Пакет не выполняет и не разрешает:

- production DDL/DML;
- production Auth changes;
- production RLS/grants;
- production Edge deploy;
- включение production CRM-кнопки;
- создание production design tasks.

Production rollout остаётся отдельным approval gate.
