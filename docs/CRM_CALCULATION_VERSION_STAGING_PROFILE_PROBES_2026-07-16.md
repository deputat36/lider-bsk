# Profile probes authenticated staging E2E расчёта

Дата: 16 июля 2026 года.

Статус: source-only. Генератор не выполняет SQL и не изменяет Supabase.

## Назначение

Allowed, forbidden и inactive HTTP-сценарии требуют разных состояний одного временного CRM-профиля. Ручные UPDATE повышают риск:

- изменить не тот профиль;
- использовать production;
- оставить профиль отключённым;
- случайно изменить дополнительные поля;
- не заметить появление новых расчётов или receipts между сценариями.

Генератор:

`tools/create-calculation-version-staging-profile-probe-bundle.mjs`

создаёт четыре manifest-bound SQL-файла:

```text
allowed.sql
forbidden.sql
inactive.sql
restore-manager.sql
profile-probe-summary.json
```

Все файлы записываются с режимом `0600`.

## Среда

Допустим только staging:

`otulfnouybahfnsycxqn`

Production:

`ofewxuqfjhamgerwzull`

не содержится в generated SQL и не является допустимой целью.

Каждый файл требует exact `leader_staging.environment_guard` с repository `deputat36/lider-bsk`.

## Генерация

После создания fixture bundle:

```powershell
node tools/create-calculation-version-staging-profile-probe-bundle.mjs `
  --manifest=artifacts/calculation-version-staging-fixture/fixture-manifest.json `
  --output-dir=artifacts/calculation-version-staging-profile-probes
```

Генератор:

- проверяет manifest version и SHA-256;
- требует `synthetic_only=true`;
- требует `production_enabled=false`;
- отклоняет истёкший manifest;
- не читает email, пароль, keys или JWT;
- не подключается к Supabase;
- не создаёт и не удаляет Auth user.

## Переходы

### allowed.sql

Устанавливает только:

- role `manager`;
- `is_active=true`;
- permissions `{"calculations.write":true}`.

После этого запускается authenticated runner со сценарием `allowed`.

### forbidden.sql

Устанавливает:

- role `accountant`;
- `is_active=true`;
- permissions `{}`.

Ожидается HTTP 403 `forbidden` и permission `calculations.write` без новой версии и receipt.

### inactive.sql

Устанавливает:

- role `manager`;
- `is_active=false`;
- permissions `{"calculations.write":true}`.

Ожидается HTTP 403 `inactive_profile` без business write.

### restore-manager.sql

Возвращает профиль в:

- role `manager`;
- `is_active=true`;
- permissions `{"calculations.write":true}`.

Restore выполняется перед database cleanup, чтобы временный профиль не оставался в тестовом состоянии при прерывании процедуры.

## Защитные проверки SQL

Каждый transition:

1. проверяет exact staging environment guard;
2. требует существующего подтверждённого Auth user из manifest;
3. блокирует только manifest-bound `leader_user_profiles` row;
4. требует source calculation из того же manifest;
5. сохраняет counts calculations, items и receipts;
6. обновляет только `role`, `is_active`, `permissions`, `updated_at`;
7. сравнивает все остальные поля профиля до и после;
8. подтверждает неизменность business counts;
9. возвращает manifest ID и SHA-256.

Ошибки:

- `confirmed_staging_auth_user_required`;
- `manifest_bound_profile_required`;
- `manifest_bound_source_calculation_required`;
- `manifest_bound_profile_update_failed`;
- `profile_transition_postcondition_failed`;
- `profile_transition_changed_unapproved_fields`;
- `profile_transition_business_state_changed`.

Generated SQL не выполняет INSERT, DELETE, UPSERT, DDL, grants, revoke или операции над `auth.users`.

## Операторский порядок

1. Создать временного подтверждённого staging Auth user.
2. Сгенерировать и применить fixture `seed.sql`.
3. Сгенерировать profile probe bundle.
4. Применить `allowed.sql`, запустить allowed runner и evidence validator.
5. Применить `forbidden.sql`, запустить forbidden runner и validator.
6. Применить `inactive.sql`, запустить inactive runner и validator.
7. В `finally` или после ручного прерывания применить `restore-manager.sql`.
8. Выполнить fixture `cleanup.sql`.
9. Удалить Auth user вручную последним.
10. Выполнить post-cleanup snapshot и advisors.

## CI и границы

GitHub Actions проверяет только генератор, generated SQL-модель, production lock, разрешённые поля UPDATE и документацию.

CI не выполняет generated SQL, не создаёт Auth user и не вызывает Edge Function.

Production rollout, исправление исторических версий и включение production CRM-действия остаются запрещены без отдельного решения владельца.