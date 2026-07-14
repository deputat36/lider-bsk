# Staging design task: fixture SQL bundle

Дата: 2026-07-14

## Назначение

Пакет сокращает ручную подготовку authenticated E2E после того, как оператор создаст временного пользователя в Supabase Dashboard только в staging.

Генератор получает уже проверенный fixture manifest и создаёт два локальных файла:

- транзакционный seed SQL;
- транзакционный cleanup SQL.

Генератор не подключается к Supabase, не выполняет SQL и не создаёт Auth user.

## Контуры

Staging:

`otulfnouybahfnsycxqn`

Production:

`ofewxuqfjhamgerwzull`

Сгенерированный SQL содержит только staging project ref. Production остаётся запрещённой средой.

## Файлы

- контракт: `contracts/design-task-staging-fixture-sql-bundle-v1.json`;
- manifest generator: `tools/create-design-task-staging-fixture-manifest.mjs`;
- SQL generator: `tools/create-design-task-staging-fixture-sql-bundle.mjs`;
- tests: `tools/test_create_design_task_staging_fixture_sql_bundle.mjs`;
- source checker: `tools/check_design_task_staging_fixture_sql_bundle.py`;
- workflow: `.github/workflows/crm-design-fixture-sql-bundle-check.yml`.

Локальные результаты:

- `artifacts/design-task-staging-fixture-seed.sql`;
- `artifacts/design-task-staging-fixture-cleanup.sql`;
- `artifacts/design-task-staging-fixture-sql-bundle.json`.

Эти файлы должны оставаться локальными и исключаются из Git.

## Предварительный gate

До генерации и выполнения seed необходимо:

1. В Supabase Dashboard открыть только staging `otulfnouybahfnsycxqn`.
2. Создать временного email/password Auth user.
3. Включить подтверждение email для этого пользователя.
4. Скопировать только UUID пользователя.
5. Не сохранять email или пароль в manifest, SQL, evidence, issue или GitHub.

SQL seed проверяет наличие подтверждённого Auth user по UUID. Он не создаёт строк в `auth.users`.

## Создание manifest

Пример:

```powershell
node tools/create-design-task-staging-fixture-manifest.mjs `
  --auth-user-id=<STAGING_AUTH_USER_UUID> `
  --lead-id=<NEW_UUID> `
  --order-id=<NEW_UUID> `
  --need-id=<NEW_UUID> `
  --expected-updated-at=<ISO_TIMESTAMP> `
  --idempotency-key=<UNIQUE_TEST_KEY> `
  --task-title="Synthetic staging design E2E"
```

Manifest:

- действует не более 24 часов;
- содержит только synthetic UUID, timestamps и command metadata;
- не содержит credentials;
- связывает `profile_user_id` с `auth_user_id`;
- фиксирует exact cleanup order.

## Генерация SQL

```powershell
node tools/create-design-task-staging-fixture-sql-bundle.mjs `
  --manifest=artifacts/design-task-staging-fixture-manifest.json
```

Генератор:

- повторно валидирует manifest;
- отклоняет просроченный manifest;
- вычисляет SHA-256 manifest, seed и cleanup;
- экранирует строковые SQL literals;
- создаёт локальные файлы с режимом `0600`;
- не выполняет network requests;
- не вызывает Supabase CLI или API;
- не выполняет SQL самостоятельно.

## Seed SQL

Seed начинается с транзакции и exact environment guard.

Он проверяет:

- staging marker с project ref, environment name и repository;
- срок действия manifest;
- существование подтверждённого Auth user;
- отсутствие коллизий UUID;
- отсутствие design task, production job и receipt для тестового заказа и idempotency key.

Seed создаёт только:

1. `public.leader_user_profiles`;
2. `public.leader_leads`;
3. `public.leader_orders`;
4. `public.leader_lead_needs`.

Тестовый профиль:

- role: `manager`;
- `is_active = true`;
- email: `null`;
- permissions: `{}`.

Тестовый заказ:

- status: `Новый`;
- priority: `Обычный`;
- `is_archived = false`;
- контакты клиента: `null`;
- финансовые значения: `0`;
- `updated_at` строго равен `expected_updated_at` из manifest.

Тестовая потребность:

- `need_design = true`;
- status: `Подтверждено`;
- completeness: `100`;
- missing fields: `[]`.

Seed не создаёт:

- Auth user;
- design task;
- audit event;
- receipt;
- production job.

Эти серверные объекты должны появиться только через authenticated Edge/RPC E2E.

## Запуск E2E

После успешного seed:

1. Запустить denied probes.
2. Проверить отсутствие task/event/receipt.
3. Вернуть профиль в active manager.
4. Запустить `tools/run_design_task_staging_auth_e2e.ps1` в режиме `create_replay_conflicts`.
5. Проверить evidence v2 независимым validator.
6. Подтвердить ровно одну task, event и successful receipt.

## Cleanup SQL

Cleanup использует тот же manifest и exact environment guard.

Порядок удаления:

1. receipt;
2. design event;
3. design task;
4. production job;
5. need;
6. order;
7. lead;
8. profile.

Cleanup удаляет данные только по UUID, order ID, actor ID и idempotency key из manifest.

Cleanup принципиально не выполняет:

```sql
delete from auth.users
```

После успешного cleanup оператор удаляет временного Auth user последним через Supabase Dashboard или поддерживаемый Auth Admin API.

## Post-cleanup

После удаления Auth user необходимо выполнить:

`supabase/staging-queries/20260714_design_task_post_cleanup_snapshot.sql`

Затем проверить результат:

```powershell
node tools/validate-design-task-staging-post-cleanup-snapshot.mjs `
  artifacts/design-task-staging-post-cleanup-snapshot.json
```

Ожидается:

- Auth users и business counts = 0;
- environment guard = 1;
- RPC, helper, index и 3 SELECT policies сохранены;
- direct RPC, receipt SELECT и table-level order SELECT закрыты.

## Privacy

В manifest, generated SQL и summary запрещены:

- email пользователя;
- пароль;
- JWT;
- Authorization header;
- publishable key;
- service-role key;
- реальные данные сотрудников;
- реальные данные клиентов;
- production project ref в generated SQL.

## Production boundary

Пакет не выполняет и не разрешает:

- production DDL или DML;
- production Auth changes;
- production RLS/grants;
- production Edge deploy;
- включение production CRM-кнопки;
- создание production design tasks.

Реальный authenticated E2E по-прежнему требует ручного staging Auth user lifecycle.
