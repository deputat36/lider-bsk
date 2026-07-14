# Staging profile probe SQL bundle дизайн-задачи — 2026-07-14

## Назначение

Пакет устраняет ручную подготовку SQL между authenticated E2E-проверками ролей для `design_task.create_from_order`.

Он генерирует четыре manifest-bound SQL-файла только для staging-проекта:

`otulfnouybahfnsycxqn`

Production-проект:

`ofewxuqfjhamgerwzull`

не является допустимой целью.

Генератор:

- не подключается к Supabase;
- не выполняет SQL;
- не создаёт Auth user;
- не удаляет Auth user;
- не содержит email, пароль, JWT, publishable key или service-role key;
- записывает локальные файлы с режимом `0600`;
- использует существующий fixture manifest и его SHA-256 digest.

## Каноническая матрица ролей

Источник разрешений остаётся единственным:

`crm/v4/assets/v4/action-permissions-v1.js`

Checker подтверждает:

- `manager` имеет `design.write`;
- `accountant` не имеет `design.write`;
- `staging_unknown_probe` отсутствует в canonical role registry;
- новая независимая разрешающая матрица ролей не создаётся.

## Входные данные

Требуется существующий файл:

`artifacts/design-task-staging-fixture-manifest.json`

Manifest должен:

- иметь версию `leader-design-task-staging-fixture-manifest-v1`;
- указывать точный staging project ref;
- быть неистёкшим;
- содержать только synthetic UUID;
- связывать `profile_user_id` с тем же UUID, что и `auth_user_id`;
- не содержать credentials или production ref.

## Генерация

```powershell
node tools/create-design-task-staging-profile-probe-sql-bundle.mjs `
  --manifest=artifacts/design-task-staging-fixture-manifest.json `
  --output-dir=artifacts/design-task-staging-profile-probes `
  --summary-output=artifacts/design-task-staging-profile-probe-sql-bundle.json
```

Создаются:

```text
artifacts/design-task-staging-profile-probes/forbidden-role.sql
artifacts/design-task-staging-profile-probes/inactive-profile.sql
artifacts/design-task-staging-profile-probes/unknown-role.sql
artifacts/design-task-staging-profile-probes/restore-manager.sql
artifacts/design-task-staging-profile-probe-sql-bundle.json
```

Все файлы исключены из Git.

## Общие защитные проверки

Каждый SQL-файл перед UPDATE проверяет:

1. `leader_staging.environment_guard` содержит точный project ref `otulfnouybahfnsycxqn`.
2. Environment name равен `staging`.
3. Repository marker равен `deputat36/lider-bsk`.
4. Fixture manifest ещё не истёк.
5. Указанный Auth user существует и имеет подтверждённый email.
6. Существует только manifest-bound synthetic CRM-профиль с:
   - `email is null`;
   - `full_name = 'Synthetic staging design E2E manager'`.
7. До и после UPDATE совпадают scoped counts:
   - lead;
   - order;
   - need;
   - production job;
   - design task;
   - design event;
   - idempotency receipt.

Разрешён только один DML-объект:

```sql
update public.leader_user_profiles
```

Запрещены:

- INSERT;
- DELETE;
- UPSERT;
- DDL;
- GRANT, REVOKE и policies;
- direct RPC EXECUTE;
- любые изменения `auth.users`;
- изменения заказа, потребности, task, event, receipt или production job.

## Последовательность probe

### 1. Запрещённая роль

Применить:

`forbidden-role.sql`

Ожидаемое состояние:

- role: `accountant`;
- `is_active=true`;
- runner mode: `forbidden_role`;
- ожидаемый HTTP: `403`.

Запуск:

```powershell
./tools/run_design_task_staging_auth_e2e.ps1 `
  -Mode forbidden_role `
  -FixtureManifestPath artifacts/design-task-staging-fixture-manifest.json
```

### 2. Неактивный профиль

Применить:

`inactive-profile.sql`

Ожидаемое состояние:

- role: `manager`;
- `is_active=false`;
- runner mode: `inactive_profile`;
- ожидаемый HTTP: `403`.

### 3. Неизвестная роль

Применить:

`unknown-role.sql`

Ожидаемое состояние:

- role: `staging_unknown_probe`;
- `is_active=true`;
- runner mode: `unknown_role`;
- ожидаемый HTTP: `403`.

### 4. Обязательное восстановление

До allowed suite применить:

`restore-manager.sql`

Ожидаемое состояние:

- role: `manager`;
- `is_active=true`;
- `permissions={}`.

После восстановления можно запускать:

```powershell
./tools/run_design_task_staging_auth_e2e.ps1 `
  -Mode create_replay_conflicts `
  -FixtureManifestPath artifacts/design-task-staging-fixture-manifest.json
```

## Полный операторский порядок

1. Вручную создать отдельного подтверждённого Auth user через staging Dashboard или поддерживаемый Admin API.
2. Создать fixture manifest.
3. Сгенерировать seed/cleanup SQL bundle из PR #295.
4. Применить seed SQL только в staging.
5. Сгенерировать profile probe SQL bundle.
6. Последовательно выполнить `forbidden_role`, `inactive_profile`, `unknown_role`.
7. Применить `restore-manager.sql`.
8. Выполнить `create_replay_conflicts`.
9. Проверить evidence validator.
10. Применить manifest-bound cleanup SQL.
11. Удалить Auth user последним через Dashboard/Admin API.
12. Выполнить post-cleanup snapshot и advisors.

Нельзя выдавать SQL role simulation или source-only генерацию за выполненный authenticated HTTP E2E.

## Что остаётся открытым

Этот пакет не добавляет authenticated stale-order probe. Для него нужен отдельный manifest-bound переход `leader_orders.updated_at` и отдельный режим evidence validator. Такой этап должен быть выполнен отдельным PR, чтобы не смешивать профильные RBAC-переходы с optimistic concurrency.

## Production boundary

Пакет не изменяет production:

- DDL и DML не выполняются;
- migrations не применяются;
- RLS, grants и policies не меняются;
- Edge Functions не развёртываются;
- Auth users не создаются;
- production CRM-кнопка остаётся отключённой;
- `supabase/config.toml` продолжает указывать на `ofewxuqfjhamgerwzull`.

Production rollout запрещён без отдельного явного решения владельца.
