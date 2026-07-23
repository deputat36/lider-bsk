# Production rollout readiness монтажа v1

Дата: 23 июля 2026 года.

## Результат read-only аудита

Production Supabase: `ofewxuqfjhamgerwzull`.

Уже существуют:

- `leader_private` schema;
- `extensions.digest(bytea,text)`;
- `leader_user_profiles`;
- `leader_orders`;
- `leader_production_jobs`;
- `leader_installation_jobs`;
- `leader_installation_job_items`;
- `leader_installation_events`;
- `leader_installation_comments`;
- необходимые поля заказа и монтажного задания;
- индексы связей по `order_id` и `job_id`.

Текущие строки:

- orders — 0;
- installation jobs — 0;
- installation items — 0;
- installation events — 0;
- installation comments — 0.

Отсутствуют:

- canonical role/action matrix;
- `leader_private.leader_actor_has_crm_action(uuid,text)`;
- `public.leader_actor_has_crm_action_rpc(uuid,text)`;
- `leader_private.leader_command_receipts`;
- `public.leader_read_installation_job_rpc(uuid,uuid)`;
- `public.leader_update_installation_job_rpc(jsonb)`;
- Edge Function `leader-crm-installation`.

Production не изменялся во время аудита.

## Проверенный staging baseline

Staging: `otulfnouybahfnsycxqn`.

Подтверждены:

- реальный user-JWT smoke;
- real headless Chrome smoke карточки;
- privacy-safe read;
- atomic update job + order + event + receipt;
- optimistic concurrency без потери точности timestamp;
- idempotent replay;
- одна update-мутация;
- полная очистка synthetic fixtures.

Ожидаемые артефакты:

- Edge `leader-crm-installation` v2;
- `verify_jwt=true`;
- SHA-256 `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`;
- read RPC MD5 `5a353818606012d0e657a83f133723b6`, 5432 bytes;
- update RPC MD5 `0ed4669197dac1f2695e763d0eec54e1`, 19061 bytes.

## Почему staging migrations нельзя копировать целиком

`20260721_01_canonical_action_rbac.sql` содержит не только role/action core, но и staging guard и design-specific wrapper.

Production candidate должен выделить только:

1. `leader_role_action_matrix_v1`;
2. canonical seed ролей и действий;
3. actor-aware permission function;
4. service-role permission RPC;
5. command receipt table и её ограничения;
6. installation helper/read/update RPC.

Нельзя переносить:

- `leader_staging.environment_guard`;
- design wrappers;
- calculation и offer wrappers;
- smoke bootstrap;
- временный `pg_net` transport;
- fixture RPC;
- `nav_*` и `nav_v2_*` объекты.

## Gate 1 — production database

Требует отдельного явного разрешения.

До применения:

1. Выполнить `PREFLIGHT_INSTALLATION_PRODUCTION_ROLLOUT_2026-07-23.sql`.
2. Подтвердить, что installation tables всё ещё существуют.
3. Зафиксировать фактические row counts.
4. Проверить отсутствие конфликтующих функций.
5. Подготовить отдельную rollback migration.
6. Проверить migration source CI checker.

Применить только минимальные production migrations:

- canonical RBAC core;
- actor permission RPC;
- command receipts;
- installation read/update RPC.

После применения:

- проверить MD5 и bytes RPC;
- проверить пустой `search_path`;
- проверить `service_role_execute=true`;
- проверить `anon_execute=false`;
- проверить `authenticated_execute=false`;
- запустить Supabase security и performance advisors.

Frontend на этом этапе остаётся заблокированным.

## Gate 2 — production Edge

Требует отдельного явного разрешения после успешного Gate 1.

Развернуть:

- slug `leader-crm-installation`;
- `verify_jwt=true`;
- production environment guard вместо staging project ref;
- тот же request contract и allowlist.

Smoke до frontend switch:

- missing JWT → 401;
- invalid JWT → 401;
- forbidden role → 403;
- неизвестный synthetic UUID → 404;
- никаких рабочих данных не изменяется.

Frontend всё ещё остаётся на прежнем пути.

## Gate 3 — production frontend switch

Требует отдельного явного разрешения после Gate 2.

Изменить route так, чтобы production мог использовать Edge read/write. Переключение должно быть отдельным PR с:

- exact production hostname;
- fail-closed route;
- отдельным feature flag или однозначным environment route;
- сохранённой возможностью немедленно вернуть production lock;
- browser direct write запрещён для нового маршрута.

## Gate 4 — authenticated production browser smoke

Требует отдельного разрешения на временные Auth/DML fixtures.

Проверить:

- настоящую карточку;
- authenticated session;
- privacy projection;
- одну update-команду;
- server read-back;
- linked order consistency;
- cleanup Auth user, profile, order, job, items, events, comments и receipts.

## Rollback-порядок

1. Сначала вернуть frontend route в `production_locked`.
2. Подтвердить отсутствие новых Edge-вызовов.
3. Удалить или отключить `leader-crm-installation`.
4. Удалять installation RPC только после блокировки frontend и Edge.
5. Сохранять canonical RBAC core, если он уже используется другими CRM-модулями.
6. Не удалять существующие business tables.
7. Не выполнять broad schema drop, truncate или data backfill.

## Stop conditions

Rollout немедленно остановить при:

- несовпадении MD5/bytes;
- неожиданном browser EXECUTE;
- новом security warning;
- изменении row counts без planned fixture;
- ошибке linked order update;
- более чем одном event при replay;
- утечке контактов, стоимости или internal comments;
- невозможности полной очистки synthetic fixtures.

## Текущая граница

- read-only production audit завершён;
- preflight сохранён;
- readiness contract сохранён;
- production migration source ещё не подготовлен;
- production Supabase не изменялся;
- production Edge не развёртывался;
- frontend production route остаётся locked;
- `nav_*` не изменялся.
