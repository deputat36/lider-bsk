# Authenticated staging E2E kit дизайн-задачи — 2026-07-14

## Статус

Подготовлен source-only операторский kit для реального authenticated HTTP E2E существующего staging-контура design task.

Контуры:

- staging: `otulfnouybahfnsycxqn`;
- production: `ofewxuqfjhamgerwzull`;
- Edge Function: `leader-crm-design`;
- action: `design_task.create_from_order`.

Kit не создаёт Auth user, профиль или business fixtures. Он начинает работу только после того, как оператор вручную создал временного пользователя в staging и подготовил синтетические строки через контролируемый SQL-процесс.

Подключённый Supabase connector по-прежнему не предоставляет безопасные create/delete Auth user операции. Поэтому positive E2E не объявляется выполненным до реального запуска этого kit.

## Состав

- `contracts/design-task-staging-auth-e2e-v1.json` — environment, network, evidence и cleanup contract;
- `tools/design-task-staging-auth-e2e.mjs` — Node.js runner;
- `tools/run_design_task_staging_auth_e2e.ps1` — безопасный Windows launcher;
- `tools/test_design_task_staging_auth_e2e.mjs` — fake-network behavior tests;
- `tools/check_design_task_staging_auth_e2e.py` — source checker;
- `.github/workflows/crm-design-auth-e2e-kit-check.yml` — CI.

## Границы безопасности

Runner:

- принимает только точный URL `https://otulfnouybahfnsycxqn.supabase.co`;
- отклоняет production project ref;
- использует только publishable key и временную пользовательскую сессию;
- не принимает service-role key;
- не вызывает design RPC напрямую;
- не читает private receipt table;
- не выполняет browser INSERT, UPDATE, DELETE или UPSERT;
- читает только минимальные projections `leader_orders`, `leader_lead_needs`, `leader_design_tasks`;
- вызывает только `leader-crm-design`;
- завершает текущую Auth session через logout;
- не удаляет Auth user или database fixtures автоматически;
- формирует evidence без email, password, access token, refresh token, Authorization header, клиентских контактов, финансов и внутренних комментариев.

## Подготовка временного Auth user

В Supabase Dashboard открыть только staging-проект `otulfnouybahfnsycxqn`.

Создать временного пользователя:

- использовать адрес в контролируемом тестовом домене или `example.invalid`, если Dashboard допускает такой адрес;
- не использовать email сотрудника или клиента;
- не использовать production identity;
- email должен быть подтверждён, чтобы password sign-in работал;
- пароль не сохранять в GitHub, issue, документации, скриншотах или сообщениях;
- после E2E пользователь должен быть удалён через Dashboard или Admin API.

Удаление строки из `auth.users` через произвольный SQL не является целевым operator flow. Supabase Auth user удаляется через Dashboard или Auth Admin API.

## Подготовка synthetic fixtures

До запуска runner создать только в staging:

1. активный `leader_user_profiles` для UUID временного Auth user;
2. роль `manager` для allowed suite;
3. один synthetic lead;
4. один synthetic order;
5. одну synthetic need с `need_design=true`;
6. не создавать design task заранее;
7. не создавать client, finance, payment или production fixtures.

Использовать нейтральные строки и `example.invalid`. Не использовать реальные имена, телефоны, адреса, суммы, комментарии или тексты заказов.

Зафиксировать без секретов:

- order UUID;
- need UUID;
- точный `leader_orders.updated_at`;
- уникальный idempotency key.

## Проверка плана

Из корня репозитория:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run_design_task_staging_auth_e2e.ps1 -Mode plan
```

Plan mode:

- не требует credentials;
- не выполняет сетевые запросы;
- показывает exact staging lock;
- показывает поддерживаемые режимы;
- не выводит значения secret inputs.

## Allowed suite

```powershell
powershell -ExecutionPolicy Bypass -File tools/run_design_task_staging_auth_e2e.ps1 `
  -Mode create_replay_conflicts `
  -OrderId '<synthetic-order-uuid>' `
  -NeedId '<synthetic-need-uuid>' `
  -ExpectedUpdatedAt '<exact-order-updated-at>' `
  -IdempotencyKey '<unique-synthetic-key>' `
  -TaskTitle 'Synthetic staging design E2E'
```

Launcher запросит:

- staging publishable key;
- email временного staging Auth user;
- пароль временного staging Auth user.

Publishable key и пароль вводятся через secure prompt и не попадают в аргументы процесса. Environment variables удаляются в `finally` после завершения runner.

Allowed suite подтверждает:

1. password authentication — HTTP 200;
2. `/auth/v1/user` — HTTP 200;
3. safe order/need/task read до создания;
4. create — HTTP 201, `idempotent_replay=false`;
5. exact replay тем же command — HTTP 200, `idempotent_replay=true`;
6. изменённый payload с прежним key — HTTP 409;
7. новый key при существующей active task — HTTP 409;
8. safe read-after-success — ровно одна design task;
9. logout текущей сессии.

## Denied probes

Каждый denied probe выполняется на чистом synthetic fixture до успешного create либо после полного cleanup предыдущего allowed suite.

### Forbidden role

Изменить только staging-профиль временного пользователя на `accountant`, затем:

```powershell
powershell -ExecutionPolicy Bypass -File tools/run_design_task_staging_auth_e2e.ps1 `
  -Mode forbidden_role `
  -OrderId '<synthetic-order-uuid>' `
  -NeedId '<synthetic-need-uuid>' `
  -ExpectedUpdatedAt '<exact-order-updated-at>' `
  -IdempotencyKey '<unique-forbidden-key>'
```

Ожидание: HTTP 403, `forbidden` или `access_denied`.

### Inactive profile

Вернуть роль `manager`, установить `is_active=false`, затем запустить с `-Mode inactive_profile`.

Ожидание: HTTP 403, `access_denied` или `profile_check_failed`.

### Unknown role

Установить synthetic unknown role, затем запустить с `-Mode unknown_role`.

Ожидание: HTTP 403, `forbidden` или `access_denied`.

После каждого denied probe task/event/receipt counts не должны увеличиваться.

## Evidence

По умолчанию evidence сохраняется в:

`artifacts/design-task-staging-auth-e2e-evidence.json`

Evidence содержит:

- version;
- время начала и завершения;
- staging project ref;
- режим;
- HTTP status каждого шага;
- replay flag;
- synthetic request/task identifiers;
- безопасные projection columns;
- признак обязательного cleanup.

Evidence не содержит:

- email;
- password;
- publishable key value;
- access/refresh tokens;
- Authorization header;
- service-role key;
- контакты клиента;
- finance;
- internal comments;
- task text.

Перед публикацией evidence в PR или issue проверить файл вручную. Сам JSON-файл не должен коммититься в репозиторий.

## Cleanup

После всех probe и allowed suite удалить в staging:

1. synthetic receipt;
2. design event;
3. design task;
4. need;
5. order;
6. lead;
7. staging profile;
8. временного Auth user через Dashboard или Admin API.

Затем подтвердить:

- profiles/orders/needs/design tasks/events/receipts — 0;
- environment guard — 1;
- security WARN/ERROR по `leader_*` — 0;
- performance WARN/ERROR по `leader_*` — 0.

Удалить локальный evidence, если он больше не нужен. Проверить, что текущая сессия завершена и временные environment variables отсутствуют.

## Production boundary

Запрещено:

- использовать production Auth user или JWT;
- направлять runner на production URL;
- переносить fixtures в production;
- применять production DDL/RLS/grants;
- deploy `leader-crm-design` в production;
- включать production-кнопку;
- выполнять production backfill.

Production rollout остаётся отдельным approval gate владельца.
