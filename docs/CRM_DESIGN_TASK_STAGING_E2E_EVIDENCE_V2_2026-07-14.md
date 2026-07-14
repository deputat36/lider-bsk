# Staging design-task E2E evidence v2 — 2026-07-14

## Статус

Фактический `main` уже содержит:

- staging RPC и transaction/idempotency harness из PR #277;
- staging Edge Function `leader-crm-design` из PR #279/#280;
- source-only CRM transport из PR #281;
- минимальный browser read-path из PR #283;
- authenticated E2E operator kit из PR #286.

Подключённый Supabase tool по-прежнему не предоставляет безопасные create/delete Auth user операции. Поэтому реальный authenticated HTTP E2E в этом этапе не выполнялся и не имитировался через SQL в `auth.users`.

## Причина v2

В v1 runner шаг `logout_current_session` добавлялся в `finally` после построения копии evidence. Сессия фактически завершалась, но сохранённый JSON мог не содержать обязательный logout-шаг.

V2 orchestration устраняет этот дефект:

1. Выполняет suite или denied probe.
2. Завершает текущую Auth-сессию.
3. Добавляет результат logout в массив шагов.
4. Только после этого строит и очищает evidence.
5. Независимый validator проверяет сохранённый JSON.

Старый `tools/design-task-staging-auth-e2e.mjs` остаётся low-level модулем безопасных Auth, SELECT и Edge-вызовов. Операторский launcher теперь вызывает только v2 orchestration.

## Файлы

- `contracts/design-task-staging-fixture-manifest-v1.json` — контракт disposable fixtures;
- `tools/create-design-task-staging-fixture-manifest.mjs` — локальный генератор manifest;
- `tools/design-task-staging-auth-e2e-v2.mjs` — manifest-driven runner;
- `tools/validate-design-task-staging-auth-e2e-evidence.mjs` — независимый evidence validator;
- `tools/test_create_design_task_staging_fixture_manifest.mjs` — тест generator;
- `tools/test_design_task_staging_auth_e2e_v2.mjs` — fake-network behavior и negative tests;
- `tools/check_design_task_staging_auth_e2e_v2.py` — source/production-boundary checker;
- `.github/workflows/crm-design-auth-e2e-v2-check.yml` — отдельный CI;
- `tools/run_design_task_staging_auth_e2e.ps1` — Windows launcher, переключённый на v2.

## Exact environment boundary

Разрешён только staging project ref:

`otulfnouybahfnsycxqn`

Production project ref:

`ofewxuqfjhamgerwzull`

Production ref запрещён:

- в manifest;
- в evidence;
- в runner endpoint;
- в operator inputs;
- в Auth identity;
- в fixture identifiers и cleanup operations.

`supabase/config.toml` продолжает указывать на production. V2 runner не читает этот файл для подключения и не выполняет deploy или migration.

## Fixture manifest

Manifest создаётся локально после ручного создания временного staging Auth user и synthetic business fixtures.

Обязательные свойства:

- `manifest_version=leader-design-task-staging-fixture-manifest-v1`;
- случайный `manifest_id` UUID;
- exact staging project ref;
- `synthetic_only=true`;
- `production_enabled=false`;
- срок жизни не более 24 часов;
- UUID временного Auth user, lead, order и need;
- `profile_user_id` совпадает с `auth_user_id`;
- order/lead/need IDs различаются;
- snapshot `expected_updated_at`;
- action `design_task.create_from_order`;
- уникальный non-secret idempotency key;
- нулевой design baseline;
- ожидаемые 1 task, 1 event и 1 successful receipt после success;
- точный cleanup order.

Manifest не может содержать:

- email;
- пароль;
- publishable key;
- access или refresh token;
- Authorization header;
- service-role key;
- production project ref.

Локальные manifest и evidence исключены через `.gitignore`.

## Создание manifest

Пример запуска после получения synthetic UUID:

```powershell
node tools/create-design-task-staging-fixture-manifest.mjs `
  --auth-user-id=<STAGING_AUTH_USER_UUID> `
  --lead-id=<SYNTHETIC_LEAD_UUID> `
  --order-id=<SYNTHETIC_ORDER_UUID> `
  --need-id=<SYNTHETIC_NEED_UUID> `
  --expected-updated-at=<ORDER_UPDATED_AT_ISO> `
  --idempotency-key=<UNIQUE_NON_SECRET_KEY> `
  --task-title="Synthetic staging design E2E" `
  --output=artifacts/design-task-staging-fixture-manifest.json
```

Генератор:

- не подключается к Supabase;
- не создаёт Auth user;
- не создаёт или удаляет database rows;
- не принимает credentials;
- записывает файл с ограниченными правами;
- по умолчанию задаёт срок жизни четыре часа.

## План без сети

```powershell
./tools/run_design_task_staging_auth_e2e.ps1 -Mode plan
```

Если manifest существует, plan mode проверяет его локально и показывает SHA-256 digest. Сетевые запросы не выполняются.

## Denied probes

Сначала выполнить отдельно:

```powershell
./tools/run_design_task_staging_auth_e2e.ps1 -Mode forbidden_role
./tools/run_design_task_staging_auth_e2e.ps1 -Mode inactive_profile
./tools/run_design_task_staging_auth_e2e.ps1 -Mode unknown_role
```

Для каждого режима нужен профиль в соответствующем временном состоянии. Ожидается HTTP 403 и один из безопасных кодов:

- `forbidden`;
- `access_denied`;
- `profile_check_failed`.

После каждого probe validator требует успешный logout. Task, event и receipt counts не должны увеличиться.

## Allowed suite

После возврата временного профиля в active manager:

```powershell
./tools/run_design_task_staging_auth_e2e.ps1 -Mode create_replay_conflicts
```

Ожидаемый порядок evidence:

1. `fixture_manifest` — local validation;
2. `authenticate` — HTTP 200;
3. `auth_user` — HTTP 200;
4. `safe_read_before` — HTTP 200, 1 order, 1 need, 0 tasks;
5. `create` — HTTP 201, `idempotent_replay=false`;
6. `exact_replay` — HTTP 200, `idempotent_replay=true`, тот же task ID;
7. `same_key_modified_payload` — HTTP 409;
8. `new_key_active_task` — HTTP 409;
9. `safe_read_after` — HTTP 200, ровно 1 task;
10. `logout_current_session` — HTTP 200 или 204.

## Evidence validator

Launcher автоматически выполняет:

```powershell
node tools/validate-design-task-staging-auth-e2e-evidence.mjs `
  --evidence=artifacts/design-task-staging-auth-e2e-evidence-v2.json `
  --manifest=artifacts/design-task-staging-fixture-manifest.json
```

Validator проверяет:

- evidence и runner versions;
- exact staging project ref;
- manifest ID и SHA-256 digest;
- срок жизни manifest;
- порядок и количество шагов;
- HTTP statuses;
- create/replay task identity;
- safe read counts;
- conflict error codes;
- успешный logout;
- exact safe projections;
- `cleanup_required=true`;
- отсутствие secret/private/production material.

Невалидный evidence завершает процесс с ненулевым exit code и не должен использоваться как подтверждение E2E.

## Cleanup

V2 runner завершает только текущую пользовательскую сессию. Он намеренно не удаляет fixtures или Auth user.

Cleanup выполняется отдельно и строго в порядке:

1. receipt;
2. design event;
3. design task;
4. need;
5. order;
6. lead;
7. profile;
8. Auth user через Dashboard или поддерживаемый Auth Admin API.

После cleanup подтвердить:

- profiles/orders/needs/tasks/events/receipts — 0;
- environment guard — 1;
- security WARN/ERROR по staging `leader_*` — 0;
- performance WARN/ERROR по staging `leader_*` — 0.

## Production boundary

Этот этап source-only.

Не выполнялись:

- staging DDL/DML;
- staging Auth user creation;
- staging fixture creation;
- staging Edge deploy;
- production DDL/DML;
- production Auth/RLS/grants/policies;
- production Edge deploy;
- production data changes;
- включение production CRM-кнопки.

Production rollout остаётся отдельным approval gate владельца.
