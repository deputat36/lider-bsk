# Manifest-aware authenticated staging runner версий расчёта

Дата: 16 июля 2026 года.

Статус: source-only. Сетевой E2E не выполняется автоматически.

## Назначение

Существующий runner:

`tools/run_calculation_version_staging_auth_e2e.mjs`

может брать synthetic source IDs и optimistic concurrency token напрямую из:

`fixture-manifest.json`.

Manifest создаётся генератором:

`tools/create-calculation-version-staging-fixture-bundle.mjs`.

Это исключает ручное копирование:

- `source_calculation_id`;
- `expected_updated_at`;
- `need_id`;
- idempotency key;
- тестового заголовка.

## Новая переменная

```text
LIDER_STAGING_FIXTURE_MANIFEST_PATH
```

Пример:

```powershell
$env:LIDER_STAGING_FIXTURE_MANIFEST_PATH = "artifacts/calculation-version-staging-fixture/fixture-manifest.json"
```

При наличии manifest runner проверяет:

- версию manifest;
- exact staging project ref `otulfnouybahfnsycxqn`;
- `synthetic_only=true`;
- `production_enabled=false`;
- срок действия manifest;
- UUID всех fixtures;
- совпадение `profile_user_id` и `auth_user_id`;
- SHA-256 manifest;
- action `calculation.create_version`;
- cleanup order;
- отсутствие secret-like полей.

## Fail-closed binding

Manifest является источником истины для:

- `LIDER_STAGING_SOURCE_CALCULATION_ID`;
- `LIDER_STAGING_EXPECTED_UPDATED_AT`;
- `LIDER_STAGING_NEED_ID`;
- `LIDER_STAGING_IDEMPOTENCY_KEY`;
- `LIDER_STAGING_TITLE`.

Если одновременно заданная env-переменная отличается от manifest, runner завершается ошибкой:

```text
fixture_manifest_mismatch:<ENV_NAME>
```

Manifest с истёкшим сроком завершается ошибкой `fixture_manifest_invalid:manifest_expired`.

Ошибка чтения или JSON parsing не раскрывает содержимое файла и возвращает `fixture_manifest_read_failed`.

Без `LIDER_STAGING_FIXTURE_MANIFEST_PATH` прежний режим env-only продолжает работать.

## Безопасный PowerShell launcher

Добавлен:

`tools/run_calculation_version_staging_auth_e2e.ps1`.

Запуск:

```powershell
./tools/run_calculation_version_staging_auth_e2e.ps1 `
  -FixtureManifestPath artifacts/calculation-version-staging-fixture/fixture-manifest.json `
  -Scenario allowed
```

Допустимые сценарии:

- `allowed`;
- `forbidden`;
- `inactive`.

Launcher:

1. проверяет существование manifest;
2. использует exact staging URL `https://otulfnouybahfnsycxqn.supabase.co`;
3. запрашивает publishable key через `Read-Host -AsSecureString`;
4. запрашивает временный staging email;
5. запрашивает пароль через `Read-Host -AsSecureString`;
6. удаляет старые source/idempotency env-переменные;
7. устанавливает manifest как единственный источник fixture IDs;
8. запускает Node runner;
9. в `finally` удаляет все управляемые env-переменные;
10. обнуляет локальные plaintext и SecureString переменные.

Launcher не записывает credentials в файл и не печатает их.

## Полный порядок

1. Вручную создать временного подтверждённого Auth user только в staging.
2. Запустить fixture bundle generator с UUID пользователя.
3. Выполнить generated `seed.sql` только в staging SQL Editor.
4. Запустить PowerShell launcher со сценарием `allowed`.
5. Зафиксировать HTTP 201/200/409/409 и safe response evidence.
6. Перевести profile в запрещённую роль и запустить `forbidden`.
7. Установить `is_active=false` и запустить `inactive`.
8. Выполнить generated `cleanup.sql`.
9. Удалить Auth user вручную последним.
10. Проверить нулевые counters и advisors.

## Evidence

Успешный runner summary теперь дополнительно содержит:

- `fixtureManifestId`;
- `fixtureManifestDigest`.

Это позволяет связать HTTP evidence с exact seed/cleanup bundle без сохранения credentials.

## Границы

Не выполняются автоматически:

- создание или удаление Auth user;
- seed SQL;
- cleanup SQL;
- Edge Function deployment;
- production DDL/DML;
- production Auth;
- production HTTP E2E.

Production project ref `ofewxuqfjhamgerwzull` остаётся запрещённой целью.

GitHub Actions выполняет только syntax, offline behavior и source checks.