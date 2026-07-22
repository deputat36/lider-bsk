# Staging Auth fixture lifecycle для монтажа

Дата фиксации: 22 июля 2026 года.

## Назначение

`tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs` создаёт два одноразовых staging Auth-пользователя, выполняет реальный JWT smoke функции `leader-crm-installation v2` и удаляет все созданные сущности в `finally`.

Этот инструмент нужен только для снятия последнего gate перед staging UI wiring. Он не предназначен для production и не должен запускаться из браузера.

## Почему отдельный lifecycle

На момент подготовки пакета staging содержит:

- Auth users: 0;
- активные `leader_user_profiles`: 0;
- installation jobs/items/events/comments/receipts: 0;
- `leader-crm-installation v2` — ACTIVE;
- `verify_jwt=true`;
- Edge SHA-256: `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`.

Без Auth-пользователей нельзя получить настоящие пользовательские JWT и честно проверить canonical action gate.

## Роли

Lifecycle использует каноническую матрицу staging:

- `installer` — имеет `installation.read` и `installation.write`;
- `accountant` — не имеет этих действий.

Роль не передаётся в Edge payload. Она хранится только в `leader_user_profiles` и проверяется серверным RPC.

## Режимы

### План без изменений

```bash
node tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs --mode=plan
```

Режим `plan` не читает ключи и не меняет Auth или базу.

### Реальный запуск

Запуск возможен только при всех runtime-переменных:

```bash
export STAGING_SUPABASE_URL='https://otulfnouybahfnsycxqn.supabase.co'
export STAGING_SUPABASE_PUBLISHABLE_KEY='...'
export STAGING_SUPABASE_SECRET_KEY='...'
export ALLOW_STAGING_AUTH_MUTATION='YES_DELETE_ALL_FIXTURES'
node tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs --mode=run
```

Значения ключей, паролей и JWT нельзя записывать в репозиторий, issue, PR, логи или evidence.

## Поддержка ключей

- `sb_publishable_*` используется только в заголовке `apikey` для пользовательского Auth и Edge-вызовов;
- `sb_secret_*` передаётся только через `apikey`;
- legacy service-role JWT передаётся через `apikey` и `Authorization: Bearer`;
- modern secret key не передаётся в `Authorization`, чтобы платформа не пыталась разобрать его как JWT.

## Создаваемые fixtures

Lifecycle временно создаёт:

1. Auth user роли `installer`;
2. `leader_user_profiles` для `installer`;
3. Auth user роли `accountant`;
4. `leader_user_profiles` для `accountant`.

Используются синтетические адреса домена `example.invalid` и автоматически сгенерированные пароли. Email, пароли, ключи и JWT исключаются из evidence.

## Проверяемые сценарии

1. Без JWT → `401 / missing_or_invalid_jwt`.
2. Невалидный JWT → `401 / missing_or_invalid_jwt`.
3. `accountant` + `installation_job.read` → `403 / forbidden`.
4. `accountant` + `installation_job.update` → `403 / forbidden`.
5. `installer` + отсутствующий job + read → `404 / not_found` после permission gate.
6. `installer` + отсутствующий job + update → `404 / not_found` после permission gate.

Случайные job UUID гарантируют отсутствие записи в jobs/events/receipts.

## Cleanup

Cleanup выполняется в обратном порядке создания внутри `finally`:

1. logout пользовательской сессии;
2. удаление `leader_user_profiles`;
3. удаление Auth user через Admin API;
4. проверка отсутствия профиля.

Любая ошибка cleanup делает весь запуск неуспешным. Успешный smoke без подтверждённой очистки не считается пройденным.

## Preflight

Перед `--mode=run` оператор должен подтвердить:

- URL точно равен `https://otulfnouybahfnsycxqn.supabase.co`;
- production ref `ofewxuqfjhamgerwzull` отсутствует в URL;
- в staging нет рабочих данных;
- Edge version/hash совпадают с contract;
- есть право использовать staging secret/service-role key;
- после запуска будет выполнен SQL postflight по Auth users, profiles, installation rows и receipts.

## Postflight

После запуска необходимо read-only проверить:

```sql
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.leader_user_profiles) as profiles,
  (select count(*) from public.leader_installation_jobs) as jobs,
  (select count(*) from public.leader_installation_job_items) as items,
  (select count(*) from public.leader_installation_events) as events,
  (select count(*) from public.leader_installation_comments) as comments,
  (select count(*) from leader_private.leader_command_receipts where action = 'installation_job.update') as receipts;
```

Ожидаемый итог для текущего пустого harness: все значения равны 0.

Также нужно проверить Auth и Edge logs за период запуска и убедиться, что нет ошибок cleanup.

## Evidence

По умолчанию создаётся:

`artifacts/installation-auth-fixture-lifecycle-evidence.json`

Файл записывается с режимом `0600`. Evidence содержит только статусы, действия, роли и результат cleanup. Запрещённые ключи удаляются рекурсивно по шаблону:

`password|token|authorization|apikey|api_key|secret|email`

## Граница

В текущем PR lifecycle только добавлен в GitHub и проверяется mocked unit-тестами.

Не выполняются:

- создание Auth users;
- изменение staging-профилей;
- вызов реального Edge с пользовательскими JWT;
- Supabase migration;
- Edge deploy;
- frontend switch;
- любые production-изменения;
- изменения `nav_*`.

Production не изменялся.
