# Staging installation user-JWT smoke v1

Дата подготовки: 21 июля 2026 года.

## Цель

Проверить реальный JWT-first путь `leader-crm-installation` перед переключением frontend с трёх прямых browser writes на одну атомарную Edge-команду.

Схема, FK и индексы staging уже согласованы. Edge и RPC source синхронизированы. Не подтверждён только authenticated user-JWT gate.

## Безопасный smoke

Runner:

`tools/run_crm_staging_installation_user_jwt_smoke.mjs`

Он не создаёт installation fixtures и использует случайный заведомо отсутствующий `job_id`.

Проверки:

1. Без JWT → `401 missing_or_invalid_jwt`.
2. Невалидный JWT → `401 missing_or_invalid_jwt`.
3. Валидный JWT без `installation.write` → `403 forbidden`.
4. Валидный JWT с `installation.write` → `404 not_found` после прохождения JWT и canonical permission gate.

Четвёртый ответ подтверждает, что запрос дошёл до transactional RPC, но не изменил данные: job отсутствует, receipt создаётся только после успешного поиска и блокировки job.

## Runtime variables

Передаются только во время ручного запуска:

- `STAGING_SUPABASE_URL`;
- `STAGING_SUPABASE_PUBLISHABLE_KEY`;
- `STAGING_INSTALLATION_AUTHORIZED_USER_JWT`;
- `STAGING_INSTALLATION_FORBIDDEN_USER_JWT`.

JWT и ключи нельзя сохранять в GitHub, artifacts, workflow logs, документацию или shell history. Runner не печатает значения токенов.

Authorized и forbidden JWT должны принадлежать разным активным staging-профилям и отличаться друг от друга.

## Запуск

```bash
STAGING_SUPABASE_URL='https://otulfnouybahfnsycxqn.supabase.co' \
STAGING_SUPABASE_PUBLISHABLE_KEY='runtime-only' \
STAGING_INSTALLATION_AUTHORIZED_USER_JWT='runtime-only' \
STAGING_INSTALLATION_FORBIDDEN_USER_JWT='runtime-only' \
node tools/run_crm_staging_installation_user_jwt_smoke.mjs
```

Пример показывает только имена переменных. Реальные значения в репозиторий не добавляются.

## Preflight

Перед запуском подтвердить:

- project ref `otulfnouybahfnsycxqn`;
- Edge `leader-crm-installation` ACTIVE;
- `verify_jwt=true`;
- Edge SHA `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`;
- RPC MD5 `0ed4669197dac1f2695e763d0eec54e1`;
- installation jobs/items/events/comments = 0 либо зафиксирован известный baseline;
- receipts `installation_job.update` = 0 либо зафиксирован известный baseline.

## Postflight

После запуска:

- counts installation tables не изменились;
- receipts не изменились;
- Edge logs не содержат runtime errors;
- security advisors не получили новых ERROR/WARN;
- результат runner содержит четыре ожидаемых сценария;
- JWT и ключи отсутствуют в logs/artifacts.

После подтверждённого postflight можно обновить command evidence:

- `user_jwt_smoke_completed=true`;
- `frontend_switch_ready=true`.

Это не означает production readiness.

## CI

Contract:

`contracts/crm-staging-installation-user-jwt-smoke-v1.json`

Checker:

`tools/check_crm_staging_installation_user_jwt_smoke.py`

Workflow:

`.github/workflows/crm-staging-installation-user-jwt-smoke-check.yml`

CI выполняет только syntax/static contract checks. Реальные JWT отсутствуют, поэтому runtime smoke в source PR не запускается.

## Граница

В этом source-пакете не выполняются Auth mutations, создание пользователей, migration apply, Edge deploy, рабочие записи, frontend switch или production-вызовы.

Production `ofewxuqfjhamgerwzull` не изменяется. `nav_*` не затрагивается.
