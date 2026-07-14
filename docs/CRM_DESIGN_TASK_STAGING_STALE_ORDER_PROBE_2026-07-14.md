# Staging stale-order probe дизайн-задачи — 2026-07-14

## Цель

Проверить реальный optimistic concurrency gate команды `design_task.create_from_order`:

- браузерный draft сохраняет `leader_orders.updated_at` как `expected_updated_at`;
- synthetic staging order получает более новую версию;
- JWT-protected `leader-crm-design` передаёт исходную версию в RPC;
- RPC должен вернуть `conflict`;
- Edge должен вернуть HTTP `409`;
- design task, event и idempotency receipt не должны сохраниться;
- после проверки версия synthetic order обязательно восстанавливается.

Пакет предназначен только для staging:

`otulfnouybahfnsycxqn`

Production:

`ofewxuqfjhamgerwzull`

не является допустимой целью.

## Состав

- contract: `contracts/design-task-staging-stale-order-probe-v1.json`;
- SQL generator: `tools/create-design-task-staging-stale-order-sql-bundle.mjs`;
- HTTP runner: `tools/design-task-staging-stale-order-e2e-v1.mjs`;
- evidence validator: `tools/validate-design-task-staging-stale-order-evidence.mjs`;
- PowerShell launcher: `tools/run_design_task_staging_stale_order_e2e.ps1`;
- behavior tests и source checker;
- отдельный GitHub workflow.

## Что генераторы не делают

Генераторы:

- не подключаются к Supabase;
- не выполняют SQL;
- не вызывают Edge Function;
- не создают и не удаляют Auth user;
- не читают service-role key;
- не сохраняют email, пароль, JWT или API keys;
- создают локальные файлы с режимом `0600`.

## Предварительные условия

До stale-order probe должны быть выполнены:

1. В staging вручную создан отдельный подтверждённый Auth user.
2. Создан неистёкший fixture manifest версии `leader-design-task-staging-fixture-manifest-v1`.
3. Применён seed SQL bundle из PR #295.
4. Synthetic CRM-профиль восстановлен в состояние:
   - role `manager`;
   - `is_active=true`;
   - `permissions={}`.
5. Для synthetic order отсутствуют:
   - production jobs;
   - design tasks;
   - design events;
   - receipts с base или stale-order idempotency key.

Каноническое право `manager → design.write` проверяется по единственному источнику:

`crm/v4/assets/v4/action-permissions-v1.js`

## Генерация SQL

```powershell
node tools/create-design-task-staging-stale-order-sql-bundle.mjs `
  --manifest=artifacts/design-task-staging-fixture-manifest.json `
  --output-dir=artifacts/design-task-staging-stale-order `
  --summary-output=artifacts/design-task-staging-stale-order-sql-bundle.json
```

Создаются:

```text
artifacts/design-task-staging-stale-order/stale-order.sql
artifacts/design-task-staging-stale-order/restore-order-version.sql
artifacts/design-task-staging-stale-order-sql-bundle.json
```

## `stale-order.sql`

Разрешён только:

```sql
update public.leader_orders
set updated_at = expected_updated_at + interval '1 second'
```

Перед UPDATE проверяются:

- exact staging environment guard;
- repository marker `deputat36/lider-bsk`;
- срок действия manifest;
- существующий подтверждённый Auth user;
- активный synthetic manager profile;
- manifest-bound lead, order и need;
- исходный `updated_at` равен manifest `expected_updated_at`;
- чистый baseline без task, event, production job и receipt.

После UPDATE проверяются:

- изменился только `updated_at`;
- все остальные поля order идентичны;
- scoped counts не изменились;
- новая версия отличается ровно на одну секунду;
- требуется обязательное восстановление.

## HTTP probe

После применения `stale-order.sql` запустить:

```powershell
./tools/run_design_task_staging_stale_order_e2e.ps1 `
  -Mode stale_order `
  -FixtureManifestPath artifacts/design-task-staging-fixture-manifest.json `
  -EvidencePath artifacts/design-task-staging-stale-order-evidence.json
```

Launcher запрашивает только в памяти:

- staging publishable key;
- email временного staging Auth user;
- пароль временного staging Auth user.

Runner выполняет:

1. password authentication только на exact staging URL;
2. `/auth/v1/user` identity verification;
3. safe SELECT order и проверку, что версия уже отличается от manifest;
4. safe SELECT design tasks и проверку нулевого baseline;
5. POST в `leader-crm-design` с idempotency suffix `-stale-order`;
6. проверку HTTP `409` и `error.code=conflict`;
7. повторный safe SELECT и доказательство, что task не создана;
8. logout текущей сессии.

Direct RPC, browser writes и service-role credentials не используются.

## Evidence

Evidence version:

`leader-design-task-staging-stale-order-evidence-v1`

Exact step order:

1. `fixture_manifest`;
2. `authenticate`;
3. `auth_user`;
4. `safe_read_stale_version`;
5. `stale_order`;
6. `safe_read_no_task`;
7. `logout_current_session`.

Validator требует:

- manifest SHA-256 match;
- exact staging project ref;
- HTTP `409`;
- `error.code=conflict`;
- ноль design tasks до и после;
- logout;
- `restore_order_version_required=true`;
- отсутствие credentials, production ref, контактов, финансов и внутренних комментариев.

## Обязательное восстановление

Сразу после evidence validation применить:

`restore-order-version.sql`

Он:

- требует текущую stale-версию `expected_updated_at + 1 second`;
- обновляет только `leader_orders.updated_at`;
- возвращает точный manifest `expected_updated_at`;
- повторно сравнивает все прочие поля и scoped counts;
- требует прежний чистый baseline.

Без восстановления нельзя запускать allowed create/replay suite.

## Полный порядок

1. Создать временного подтверждённого staging Auth user вне connector.
2. Создать fixture manifest.
3. Сгенерировать и применить seed SQL.
4. Применить `restore-manager.sql` из profile probe bundle.
5. Сгенерировать stale-order SQL bundle.
6. Применить `stale-order.sql` только в staging.
7. Запустить `stale_order` HTTP runner.
8. Проверить evidence validator.
9. Применить `restore-order-version.sql`.
10. Выполнить profile RBAC probes или allowed create/replay/conflict suite.
11. Применить manifest-bound cleanup SQL.
12. Удалить Auth user последним через Dashboard/Admin API.
13. Выполнить post-cleanup snapshot и advisors.

## Текущее подтверждение

На момент добавления пакета:

- real authenticated stale-order HTTP E2E не выполнен;
- Auth user не создавался;
- synthetic rows не создавались;
- staging DML не выполнялся;
- production не изменялся.

Source tests не являются заменой реального authenticated evidence.

## Production boundary

Запрещены без отдельного решения владельца:

- production DDL/DML;
- production migrations;
- production RLS/grants/policies;
- production Auth changes;
- deployment `leader-crm-design` в production;
- включение production CRM-кнопки;
- production rollout RPC, receipt table или active-task index.

`supabase/config.toml` продолжает указывать на `ofewxuqfjhamgerwzull`.
