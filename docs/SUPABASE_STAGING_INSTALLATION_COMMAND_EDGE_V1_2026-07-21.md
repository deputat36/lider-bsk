# Staging installation command Edge v1

Дата фиксации: 21 июля 2026 года.

## Назначение

Зафиксировать уже работающий staging transport для атомарного обновления монтажного задания и устранить deployment drift между Supabase и GitHub.

В рамках этой синхронизации новый Edge deploy и новый migration apply не выполнялись. Deployment был обнаружен read-only postflight после объединения schema preparation. Production не изменялся.

## Фактический staging deployment

Проект: `otulfnouybahfnsycxqn`.

Edge Function:

- slug: `leader-crm-installation`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `4be533387e91a4d91a025a8c7c0ea9516563a4cba7e236c270cdd23097cb6bdc`;
- source contract: `leader-crm-installation-edge-v1`.

Database:

- migration version: `20260721191810`;
- migration name: `staging_installation_job_update_rpc_20260721`;
- RPC: `public.leader_update_installation_job_rpc(jsonb)`.

## Команда

Action:

`installation_job.update`

Canonical permission:

`installation.write`

Порядок выполнения:

1. Проверка точного staging project ref.
2. Проверка пользовательского JWT через `/auth/v1/user`.
3. Строгая валидация envelope, payload и patch.
4. Проверка `installation.write` через `leader_actor_has_crm_action_rpc`.
5. Вызов service-role-only `leader_update_installation_job_rpc`.

Роль не принимается из browser payload. Actor ID и email берутся только из проверенного JWT.

## Request contract

Обязательные поля envelope:

- `action`;
- `request_id`;
- `expected_updated_at`;
- `payload`.

Обязательные поля payload:

- `job_id`;
- `idempotency_key`;
- `patch`.

Разрешённые patch-поля:

- `title`;
- `install_status`;
- `installer_name`;
- `installer_phone`;
- `address`;
- `scheduled_at`;
- `before_photo_url`;
- `after_photo_url`;
- `technical_task`;
- `tools_required`;
- `installer_comment`.

Server-owned поля не принимаются. Максимальный размер тела — 64 KiB.

## Атомарность и конкуренция

RPC выполняет одной транзакцией:

- UPDATE `leader_installation_jobs`;
- UPDATE связанного `leader_orders`;
- INSERT `leader_installation_events`;
- INSERT/UPDATE `leader_private.leader_command_receipts`.

Защита:

- `FOR UPDATE` для job;
- `FOR UPDATE` для linked order;
- advisory lock для idempotency key;
- advisory lock для request ID;
- проверка `expected_updated_at`;
- same key + same hash возвращает исходный success;
- same key + другой payload возвращает conflict;
- повторный request ID возвращает duplicate request.

При переходе в `В работе` сервер выставляет `started_at`. При переходе в `Выполнен` выставляются `completed_at` и `leader_orders.installation_completed_at`.

## Статусы

Canonical registry:

- `Не назначен`;
- `Запланирован`;
- `Перенесён`;
- `В работе`;
- `Выполнен`;
- `Не требуется`;
- `Отменён`.

Legacy aliases нормализуются server-side. Неизвестный текущий статус можно только сохранить без изменения. Неизвестный target status отклоняется.

## ACL

Все пять installation-функций:

- SECURITY INVOKER;
- `search_path=''`;
- `service_role EXECUTE=true`;
- `public EXECUTE=false`;
- `anon EXECUTE=false`;
- `authenticated EXECUTE=false`.

Три installation-таблицы:

- RLS enabled;
- browser policies отсутствуют;
- browser table privileges отсутствуют;
- service role имеет минимальный набор прав.

## Fingerprints

- `leader_installation_command_error`: `d263ee000b817642f549016be44d80de`, 365 bytes;
- `leader_installation_status_key`: `12243bd5d50a49a8bf7e281d715bba03`, 894 bytes;
- `leader_installation_status_label`: `3a1082636d166768f2b3334d76e1743d`, 555 bytes;
- `leader_installation_transition_allowed`: `2463ec1b87fa4cf46a04590ac7e97d60`, 600 bytes;
- `leader_update_installation_job_rpc`: `0ed4669197dac1f2695e763d0eec54e1`, 19061 bytes.

## Postflight

Read-only postflight подтвердил:

- installation jobs: `0`;
- installation events: `0`;
- installation comments: `0`;
- command receipts: `0`;
- Edge logs за доступный период: ошибок нет;
- новых security ERROR/WARN нет;
- INFO `rls_enabled_no_policy` соответствует закрытому service-role-only harness.

Performance Advisor отдельно выявил отсутствующие покрывающие индексы у некоторых installation FK. Это не меняет корректность команды и вынесено в отдельную задачу; DDL в этом PR не выполняется.

## GitHub source

Edge:

- `supabase/staging-functions/leader-crm-installation/index.ts`;
- `supabase/staging-functions/leader-crm-installation/contract.ts`.

RPC migration source:

- `supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql`.

Deployment evidence:

- `contracts/crm-staging-installation-command-edge-v1.json`.

Checker:

- `tools/check_crm_staging_installation_command_edge.py`.

Workflow:

- `.github/workflows/crm-staging-installation-command-edge-check.yml`.

## Frontend boundary

`crm/v4/assets/v4/installation-job-card-v2.js` пока сохраняет монтаж тремя прямыми browser writes:

1. installation job;
2. linked order;
3. installation event.

Frontend switch не выполнен. Следующий staging-only этап — заменить эту последовательность одним вызовом `leader-crm-installation` и проверить UI rollback/concurrency/idempotency.

## Production boundary

Production проект: `ofewxuqfjhamgerwzull`.

Не выполнялись:

- production migration;
- production Edge deploy;
- production frontend switch;
- изменения production RLS/grants;
- изменения Auth, Storage или secrets;
- изменения production data;
- изменения `nav_*`.

Production rollout требует отдельного явного согласования и самостоятельного rollback-плана.
