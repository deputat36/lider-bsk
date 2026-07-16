# Evidence authenticated staging E2E версий расчёта

Дата: 16 июля 2026 года.

Статус: source-only. Сетевой E2E в рамках PR не выполняется.

## Staging baseline

- project ref: `otulfnouybahfnsycxqn`;
- `leader-crm-calculations` version `3`, ACTIVE;
- `verify_jwt=true`;
- deployment ID: `91b4c99c-a03e-4cfb-ad2a-0ca4de29b7ea`;
- SHA-256: `0df6d23cc6d8b19903babbf711bb1da765111ff1f64eb7f8e970f1bcc9760ee4`;
- Auth users, profiles, leads, needs, calculations, items и receipts: 0;
- environment guard: 1.

Production `ofewxuqfjhamgerwzull` запрещён как цель runner, validator и generated SQL.

## Evidence

Evidence version:

`leader-calculation-version-staging-auth-e2e-evidence-v1`

Runner version:

`leader-calculation-version-staging-auth-e2e-runner-v2`

Launcher принимает `-EvidencePath` и задаёт `LIDER_STAGING_EVIDENCE_PATH`. JSON записывается с режимом `0600`.

Evidence содержит только версии контракта, staging ref, сценарий, timestamps, manifest ID/SHA-256, HTTP statuses, correlation UUID, cleanup flag и подтверждённый logout status.

Evidence не содержит секреты, заголовки авторизации, полные HTTP responses или клиентские данные.

## Запуск

```powershell
./tools/run_calculation_version_staging_auth_e2e.ps1 `
  -FixtureManifestPath artifacts/calculation-version-staging-fixture/fixture-manifest.json `
  -Scenario allowed `
  -EvidencePath artifacts/calculation-version-staging-auth-e2e-allowed-evidence.json
```

Launcher после runner автоматически запускает:

```powershell
node tools/validate-calculation-version-staging-auth-e2e-evidence.mjs `
  --evidence=artifacts/calculation-version-staging-auth-e2e-allowed-evidence.json `
  --manifest=artifacts/calculation-version-staging-fixture/fixture-manifest.json
```

Для `forbidden` и `inactive` используются отдельные evidence-файлы.

## Validator

Validator требует:

- exact staging project ref;
- `production_enabled=false`;
- `network_e2e=true`;
- manifest был действителен на момент запуска;
- совпадение manifest ID и SHA-256;
- allowed: HTTP 201/200/409/409;
- forbidden: HTTP 403;
- inactive: HTTP 403;
- safe projection flag для allowed;
- UUID correlation;
- logout HTTP 200 или 204;
- отсутствие secret-like material.

Allowed-сценарий обязан иметь `cleanup_required=true`. Запрещённые сценарии не должны создавать calculation ID или request ID.

## Logout

Runner не считает сценарий успешным без подтверждённого logout. Ошибка имеет код:

`auth_logout_failed:<status>`

## Post-cleanup snapshot

После generated `cleanup.sql` временная учётная запись удаляется вручную последней. Затем создаётся read-only snapshot:

```powershell
node tools/create-calculation-version-staging-post-cleanup-snapshot.mjs `
  --manifest=artifacts/calculation-version-staging-fixture/fixture-manifest.json `
  --output=artifacts/calculation-version-staging-fixture/post-cleanup-snapshot.sql
```

SQL проверяет exact environment guard и отсутствие manifest-bound Auth/profile/lead/need/calculation/item/receipt данных.

Он не выполняет DML, DDL или изменения прав.

Ошибки:

- `post_cleanup_auth_user_still_exists`;
- `post_cleanup_manifest_bound_rows_remain`.

Успешный результат содержит:

- `auth_user_absent=true`;
- `database_fixtures_absent=true`;
- `cleanup_verified=true`;
- manifest ID и SHA-256.

## Порядок

1. Создать временную подтверждённую учётную запись только в staging.
2. Сгенерировать manifest/seed/cleanup и post-cleanup snapshot.
3. Применить seed только в staging.
4. Выполнить allowed, forbidden и inactive с отдельными evidence.
5. Выполнить cleanup SQL до удаления учётной записи.
6. Удалить учётную запись вручную последней.
7. Выполнить post-cleanup snapshot SQL.
8. Проверить advisors и неизменность production.

## CI и границы

GitHub Actions выполняет только syntax, offline behavior и source checks. CI не создаёт пользователей, не вызывает Edge Function и не выполняет SQL.

Authenticated HTTP E2E остаётся незавершённым до ручного staging Auth user.

Production rollout остаётся запрещён без отдельного решения владельца.