# Authenticated staging E2E runner для версий расчёта — 2026-07-15

## Назначение

`tools/run_calculation_version_staging_auth_e2e.mjs` выполняет реальный HTTP-вызов JWT-защищённой staging Edge Function `leader-crm-calculations`.

Runner не используется production CRM и не содержит ключей, паролей, access token или refresh token.

Текущий staging baseline:

- project ref: `otulfnouybahfnsycxqn`;
- Edge Function: `leader-crm-calculations`;
- active version: `3`;
- `verify_jwt=true`;
- permission: `calculations.write`;
- Auth users: `0` на момент подготовки runner-а;
- active CRM profiles: `0`.

Поэтому authenticated HTTP E2E ещё не считается выполненным. Runner подготавливает воспроизводимый сценарий после ручного создания временного staging-пользователя через Supabase Dashboard.

## Безопасные границы

Запрещено:

- вставлять пользователя напрямую в `auth.users`;
- использовать production Auth user;
- передавать пароль или JWT в GitHub issue, PR, commit или workflow log;
- добавлять service role key в runner;
- запускать runner с production Supabase URL;
- считать offline unit test полноценным HTTP E2E;
- оставлять synthetic fixtures после завершения проверки.

Runner:

- принимает данные только из environment variables;
- проверяет точный staging project ref до авторизации;
- использует password sign-in через Supabase Auth;
- вызывает только `/functions/v1/leader-crm-calculations`;
- не использует browser table writes, service role или direct RPC;
- не печатает email, пароль, publishable key или JWT;
- выполняет best-effort logout;
- сообщает ID созданной staging-версии для последующего cleanup.

## Подготовка

В Supabase Dashboard проекта `lider-bsk-staging` вручную:

1. создать временного Auth user;
2. создать соответствующий `leader_user_profiles` row;
3. для positive сценария установить active role `manager`, `admin` или `owner`;
4. подготовить synthetic lead, need и source calculation;
5. сохранить `source_calculation_id`, `need_id` и точный `updated_at` источника.

Пароль временного пользователя не должен попадать в GitHub.

## Environment variables

Обязательные:

- `LIDER_STAGING_SUPABASE_URL` — только `https://otulfnouybahfnsycxqn.supabase.co`;
- `LIDER_STAGING_PUBLISHABLE_KEY` — staging publishable/legacy anon key;
- `LIDER_STAGING_EMAIL`;
- `LIDER_STAGING_PASSWORD`;
- `LIDER_STAGING_SOURCE_CALCULATION_ID`;
- `LIDER_STAGING_EXPECTED_UPDATED_AT`.

Дополнительные:

- `LIDER_STAGING_SCENARIO` — `allowed`, `forbidden` или `inactive`;
- `LIDER_STAGING_NEED_ID`;
- `LIDER_STAGING_IDEMPOTENCY_KEY`;
- `LIDER_STAGING_TITLE`;
- `LIDER_STAGING_ITEM_NAME`;
- `LIDER_STAGING_QTY`;
- `LIDER_STAGING_CONTRACTOR_PRICE`;
- `LIDER_STAGING_CLIENT_PRICE`.

## Запуск в PowerShell

```powershell
$env:LIDER_STAGING_SUPABASE_URL = "https://otulfnouybahfnsycxqn.supabase.co"
$env:LIDER_STAGING_PUBLISHABLE_KEY = "<staging publishable key>"
$env:LIDER_STAGING_EMAIL = "<temporary staging email>"
$env:LIDER_STAGING_PASSWORD = "<temporary staging password>"
$env:LIDER_STAGING_SCENARIO = "allowed"
$env:LIDER_STAGING_SOURCE_CALCULATION_ID = "<source calculation uuid>"
$env:LIDER_STAGING_EXPECTED_UPDATED_AT = "<source updated_at ISO timestamp>"
$env:LIDER_STAGING_NEED_ID = "<need uuid>"

node tools/run_calculation_version_staging_auth_e2e.mjs
```

После запуска очистить переменные текущего shell:

```powershell
Remove-Item Env:LIDER_STAGING_PUBLISHABLE_KEY
Remove-Item Env:LIDER_STAGING_EMAIL
Remove-Item Env:LIDER_STAGING_PASSWORD
```

## Scenario: allowed

Для active manager/admin/owner runner проверяет:

1. HTTP `201` — создана новая версия;
2. exact safe response projection;
3. HTTP `200` — exact replay без дубликата;
4. тот же calculation ID при replay;
5. HTTP `409 idempotency_conflict` при изменённом payload и том же key;
6. HTTP `409 source_changed` при устаревшем `expected_updated_at`.

Успешный итог содержит:

- `createdCalculationId`;
- `requestId`;
- `cleanupRequired: true`.

Эти идентификаторы не являются секретами, но относятся только к staging.

## Scenario: forbidden

После смены роли временного профиля на `accountant`, `designer`, `installer` или `contractor`:

```powershell
$env:LIDER_STAGING_SCENARIO = "forbidden"
node tools/run_calculation_version_staging_auth_e2e.mjs
```

Ожидается:

- HTTP `403`;
- error `forbidden`;
- permission `calculations.write`;
- отсутствие нового расчёта и receipt.

## Scenario: inactive

После установки `is_active=false`:

```powershell
$env:LIDER_STAGING_SCENARIO = "inactive"
node tools/run_calculation_version_staging_auth_e2e.mjs
```

Ожидается HTTP `403 inactive_profile` без business write.

## Cleanup

После positive сценария удалить только созданные synthetic staging-объекты:

- новую calculation version;
- её items;
- command receipt;
- synthetic source calculation/need/lead;
- временный CRM profile;
- временный Auth user и его sessions.

Затем подтвердить:

- synthetic profiles: `0`;
- synthetic Auth users: `0`;
- synthetic leads/needs/calculations/receipts: `0`;
- production migration history и Edge Functions не изменились.

## CI

GitHub Actions не выполняет сетевой E2E и не требует secrets.

CI запускает только:

- syntax check runner-а;
- offline Node tests конфигурации, environment lock, command minimization и safe response projection;
- Python source checker, запрещающий production ref, service role и secret-like material.

Authenticated HTTP E2E будет считаться завершённым только после фактического запуска runner-а с временным staging user, проверки Edge logs/receipt correlation и полного cleanup.
