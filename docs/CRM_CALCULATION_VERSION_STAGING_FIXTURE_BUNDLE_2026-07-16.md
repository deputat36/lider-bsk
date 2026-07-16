# Fixture bundle authenticated staging E2E версий расчёта

Дата: 16 июля 2026 года.

Статус: source-only. Генератор не подключается к Supabase и не выполняет SQL.

## Назначение

`tools/create-calculation-version-staging-fixture-bundle.mjs` подготавливает синтетические CRM-данные для реального authenticated HTTP E2E команды:

`calculation.create_version`.

Bundle используется только в staging:

`otulfnouybahfnsycxqn`.

Production:

`ofewxuqfjhamgerwzull`

не является допустимой целью.

## Что остаётся ручным

Подключённый Supabase connector не предоставляет безопасных операций создания и удаления Auth user.

Поэтому оператор вручную создаёт временного подтверждённого пользователя в Supabase Dashboard проекта `lider-bsk-staging`.

Запрещено:

- вставлять пользователя напрямую в `auth.users`;
- использовать production Auth user;
- помещать email, пароль, publishable key, access token или refresh token в manifest;
- коммитить сгенерированные файлы из `artifacts/`;
- удалять Auth user до выполнения cleanup SQL.

## Что создаёт генератор

После передачи только UUID существующего staging Auth user локально создаются:

```text
artifacts/calculation-version-staging-fixture/fixture-manifest.json
artifacts/calculation-version-staging-fixture/seed.sql
artifacts/calculation-version-staging-fixture/cleanup.sql
artifacts/calculation-version-staging-fixture/bundle-summary.json
```

Файлы записываются с режимом `0600`.

Генератор:

- не принимает email или пароль;
- не читает Supabase keys;
- не выполняет network requests;
- не выполняет SQL;
- не создаёт и не удаляет `auth.users`;
- не содержит production project ref в SQL;
- создаёт exact staging environment guard;
- привязывает seed и cleanup к SHA-256 manifest.

## Manifest

Версия:

`leader-calculation-version-staging-fixture-manifest-v1`.

Manifest содержит только несекретные данные:

- `manifest_id`;
- staging project ref;
- срок действия не более 24 часов;
- UUID Auth user;
- UUID synthetic profile, lead, need, source calculation и source item;
- точный `expected_updated_at` источника;
- базовый idempotency key;
- безопасный заголовок тестовой версии;
- обязательный порядок cleanup.

`profile_user_id` обязан совпадать с `auth_user_id`.

## Генерация

После ручного создания и подтверждения staging Auth user скопировать только его UUID и выполнить:

```powershell
node tools/create-calculation-version-staging-fixture-bundle.mjs `
  --auth-user-id=<STAGING_AUTH_USER_UUID> `
  --output-dir=artifacts/calculation-version-staging-fixture `
  --ttl-hours=12
```

Допустимый срок действия: от 1 до 24 часов.

`bundle-summary.json` содержит:

- SHA-256 manifest;
- SHA-256 seed SQL;
- SHA-256 cleanup SQL;
- пути к локальным файлам;
- готовые несекретные переменные существующего authenticated runner-а.

## Seed SQL

`seed.sql` запускается только в SQL Editor staging-проекта.

Перед вставками SQL проверяет:

1. exact environment guard;
2. срок действия manifest;
3. наличие подтверждённого `auth.users` row с указанным UUID;
4. отсутствие коллизий profile, lead, need, calculation, item и receipt;
5. отсутствие существующих расчётов для synthetic lead.

Seed создаёт:

- активный CRM profile с ролью `manager`;
- synthetic lead;
- synthetic need;
- source calculation версии 1 со статусом `Согласован`;
- одну source item строку;
- точный `updated_at`, используемый как optimistic concurrency token.

Seed не создаёт:

- Auth user;
- новую calculation version;
- command receipt;
- КП;
- заказ;
- реальные клиентские данные.

После COMMIT выполняются postcondition checks.

## Переменные runner-а

Секретные значения задаются вручную только в текущем shell:

```powershell
$env:LIDER_STAGING_SUPABASE_URL = "https://otulfnouybahfnsycxqn.supabase.co"
$env:LIDER_STAGING_PUBLISHABLE_KEY = "<staging publishable key>"
$env:LIDER_STAGING_EMAIL = "<temporary staging email>"
$env:LIDER_STAGING_PASSWORD = "<temporary staging password>"
```

Следующие несекретные значения копируются из `bundle-summary.json` → `runner_environment`:

- `LIDER_STAGING_SCENARIO`;
- `LIDER_STAGING_SOURCE_CALCULATION_ID`;
- `LIDER_STAGING_EXPECTED_UPDATED_AT`;
- `LIDER_STAGING_NEED_ID`;
- `LIDER_STAGING_IDEMPOTENCY_KEY`;
- `LIDER_STAGING_TITLE`.

После этого запускается:

```powershell
node tools/run_calculation_version_staging_auth_e2e.mjs
```

Ожидаемый allowed-сценарий:

- HTTP 201 create;
- HTTP 200 exact replay;
- HTTP 409 `idempotency_conflict`;
- HTTP 409 `source_changed`;
- exact safe response projection;
- `cleanupRequired=true`.

## Forbidden и inactive

Для проверки forbidden временный profile можно перевести в роль `accountant` только в staging:

```sql
update public.leader_user_profiles
set role = 'accountant', updated_at = now()
where user_id = '<STAGING_AUTH_USER_UUID>'::uuid;
```

Runner запускается с:

```powershell
$env:LIDER_STAGING_SCENARIO = "forbidden"
node tools/run_calculation_version_staging_auth_e2e.mjs
```

Ожидается HTTP 403 `forbidden` без новой версии и receipt.

Для inactive:

```sql
update public.leader_user_profiles
set role = 'manager', is_active = false, updated_at = now()
where user_id = '<STAGING_AUTH_USER_UUID>'::uuid;
```

Runner запускается с `LIDER_STAGING_SCENARIO=inactive` и должен получить HTTP 403 `inactive_profile`.

Перед cleanup profile можно вернуть в active manager, однако cleanup SQL удаляет manifest-bound profile независимо от текущей роли.

## Cleanup SQL

`cleanup.sql` выполняется только после всех HTTP-сценариев.

Порядок:

1. receipt с base idempotency key и `:stale`;
2. строки созданных версий;
3. созданные версии;
4. source item;
5. source calculation;
6. need;
7. lead;
8. CRM profile;
9. Auth user удаляется вручную последним.

SQL требует, чтобы Auth user ещё существовал. Это предотвращает потерю связи и неполный cleanup.

Cleanup удаляет только строки, связанные с UUID из manifest, и выполняет postcondition checks.

Cleanup SQL никогда не выполняет:

```sql
delete from auth.users
```

После успешного database cleanup временный Auth user удаляется вручную через Dashboard/Admin API.

## Финальная проверка

После удаления пользователя подтвердить в staging:

- Auth users — 0;
- profiles — 0;
- synthetic leads — 0;
- synthetic needs — 0;
- calculations — 0;
- calculation items — 0;
- `calculation.create_version` receipts — 0.

Затем повторно проверить:

- security advisors WARN/ERROR — 0;
- performance advisors WARN/ERROR — 0;
- `leader-crm-calculations` остаётся JWT-protected;
- production migrations, Edge Functions и данные не изменились.

## CI

GitHub Actions выполняет только offline-проверки:

- Node syntax check;
- manifest validation tests;
- seed/cleanup SQL generation tests;
- production lock;
- запрет INSERT/DELETE в `auth.users`;
- cleanup order;
- отсутствие credential-like material;
- Python source checker.

CI не создаёт Auth user, не запускает SQL и не вызывает Edge Function.