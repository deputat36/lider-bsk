# leader-crm-calculations v5 on staging

Дата фиксации: 21 июля 2026 года.

## Назначение

Этот документ фиксирует фактически работающий staging transport создания новой версии расчёта и связывает его с исходным кодом в GitHub.

Новый deploy не выполнялся. Изменение только синхронизирует репозиторий с уже активной функцией и добавляет защиту от drift.

## Фактический deployment

- проект: `otulfnouybahfnsycxqn`;
- среда: staging;
- slug: `leader-crm-calculations`;
- версия: `5`;
- статус: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4`.

Исходники:

- `supabase/functions/leader-crm-calculations/index.ts`;
- `supabase/functions/leader-crm-calculations/contract.ts`.

## Команда и доступ

- действие: `calculation.create_version`;
- разрешение: `calculations.write`;
- canonical permission RPC: `leader_actor_has_crm_action_rpc`;
- transactional business RPC: `leader_create_calculation_version_rpc`.

Разрешение `calculations.write` присутствует у owner, admin и manager. Accountant, designer, installer и contractor его не получают.

Роль не передаётся браузером и не читается из payload. Решение принимается server-side по actor ID из проверенного JWT.

## Порядок выполнения

1. Проверка точного staging project ref.
2. Проверка JWT через `/auth/v1/user`.
3. Валидация envelope и строк расчёта.
4. Проверка `calculations.write` через service-role-only RPC.
5. Транзакционный вызов `leader_create_calculation_version_rpc`.

Business RPC вызывается только после успешной аутентификации, валидации и проверки разрешения.

## Защитные границы

- POST only;
- максимальный размер тела — 256 KiB;
- максимум 200 позиций;
- обязательный UUID `request_id`;
- обязательный `expected_updated_at`;
- обязательный `idempotency_key`;
- обязательный `source_calculation_id`;
- server-side нормализация строк;
- safe projection ошибок;
- повтор идемпотентного запроса возвращает HTTP 200, новая версия — HTTP 201.

## Drift protection

Контракт:

`contracts/crm-staging-calculations-edge-deployment-v1.json`

Checker:

`tools/check_crm_staging_calculations_edge_deployment.py`

Workflow:

`.github/workflows/crm-staging-calculations-edge-check.yml`

Проверяются:

- staging ref;
- версия, статус, JWT-флаг и deployment SHA;
- canonical action и permission;
- матрица разрешённых ролей;
- порядок environment → JWT → validation → permission → RPC;
- отсутствие browser-supplied role;
- идемпотентность и optimistic concurrency;
- отсутствие секретов и JWT в репозитории;
- явная граница production.

## Rollback

Так как этот change не выполняет deploy, operational rollback не требуется.

При последующем изменении Edge Function откат выполняется повторным развёртыванием исходников, закреплённых в последнем зелёном deployment-контракте, с обязательной проверкой version/hash и Edge logs.

## Production

Production проект `ofewxuqfjhamgerwzull` этим этапом не изменялся.

Не выполнялись:

- production Edge deploy;
- DDL или DML;
- изменения RLS и grants;
- изменения Auth, Storage и secrets;
- создание или изменение рабочих расчётов, заявок, заказов и клиентов.

Production rollout требует отдельного явного согласования и самостоятельного rollback-плана.
