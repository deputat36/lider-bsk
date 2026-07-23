# Production candidate: RBAC core и command receipts для монтажа

Дата: 23 июля 2026 года  
Репозиторий: `deputat36/lider-bsk`  
Production Supabase: `ofewxuqfjhamgerwzull`

## Статус

`source_only_not_applied`

Production не изменялся во время подготовки кандидата.

Кандидат создаёт только первый database-слой будущего production rollout:

- canonical role/action matrix;
- actor-aware permission function;
- service-role permission RPC;
- durable command receipts.

Installation read/update RPC, Edge Function и frontend route в этот пакет не входят.

## Источники

Migration candidate:

`supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql`

Rollback candidate:

`supabase/production-candidates/rollback/20260723_01_installation_rbac_receipts_candidate_rollback.sql`

Contract:

`contracts/crm-installation-production-rbac-receipts-candidate-v1.json`

## Проверенный production preflight

На момент аудита:

- профилей: 4;
- роли: `owner` — 2, `admin` — 1, `manager` — 1;
- заказов: 0;
- installation jobs/items/events/comments: по 0;
- `leader_staging.environment_guard` отсутствует;
- role/action matrix отсутствует;
- actor permission function/RPC отсутствуют;
- command receipts отсутствуют.

Все существующие production-роли входят в canonical matrix.

## Что создаёт migration candidate

### Таблицы

- `leader_private.leader_role_action_matrix_v1`;
- `leader_private.leader_command_receipts`.

На обеих таблицах включается RLS. `public`, `anon`, `authenticated` не получают табличных привилегий.

### Функции

- `leader_private.leader_actor_has_crm_action(uuid,text)`;
- `public.leader_actor_has_crm_action_rpc(uuid,text)`.

Browser-роли не получают `EXECUTE`. Публичный bridge доступен только `service_role`.

### Fail-closed правила

- неизвестная роль — deny;
- неизвестное действие — deny;
- неактивный профиль — deny;
- пустой actor/action — deny;
- browser-supplied role не принимается;
- применение на staging блокируется наличием `leader_staging.environment_guard` и кодом `production_candidate_rejected_on_staging`;
- повторная установка поверх существующих объектов блокируется.

## Не входит в кандидат

- `leader_read_installation_job_rpc`;
- `leader_update_installation_job_rpc`;
- `leader-crm-installation` Edge;
- production frontend switch;
- design wrappers;
- calculation/offer logic;
- smoke bootstrap;
- `pg_net` transport;
- изменения `nav_*`;
- изменения Auth, Storage или данных.

## Approval gate

Применение migration candidate требует отдельного явного разрешения на production database migration.

До разрешения запрещено:

- вызывать `Supabase.apply_migration` для production;
- копировать SQL в production SQL Editor;
- развёртывать installation Edge;
- переключать production frontend route.

## Preflight непосредственно перед будущим применением

Повторить read-only readiness SQL:

`docs/PREFLIGHT_INSTALLATION_PRODUCTION_ROLLOUT_2026-07-23.sql`

Дополнительно подтвердить:

1. `leader_staging.environment_guard` отсутствует.
2. Все production-роли входят в canonical list.
3. Целевые таблицы и функции ещё отсутствуют.
4. Нет незапланированных installation RPC.
5. Production route остаётся `production_locked`.
6. Есть отдельное явное разрешение на Gate 1 — production database.

Любое расхождение — stop condition.

## План будущего применения

1. Сохранить preflight evidence.
2. Применить только `20260723_01_installation_rbac_receipts_candidate.sql`.
3. Не развёртывать Edge и не переключать frontend в том же шаге.
4. Выполнить read-only postflight.
5. Запустить транзакционную role/action проверку без постоянных данных.
6. Проверить advisors.
7. Зафиксировать migration version, function fingerprints и ACL.
8. Только после отдельного review готовить installation read/update RPC candidate.

## Обязательный postflight

Проверить:

- matrix содержит ровно 7 canonical roles;
- `owner`, `admin`, `manager` имеют `installation.read/write`;
- `installer` имеет `installation.read/write`;
- `accountant` не имеет installation permissions;
- неизвестная роль/action возвращает false;
- неактивный профиль возвращает false;
- browser-роли не имеют table privileges;
- browser-роли не имеют function execute;
- `service_role` имеет ожидаемые права;
- receipts table пуста;
- production данные не изменились;
- security/performance advisors не показывают новых ERROR/WARN.

## Rollback

Rollback допустим только до установки installation read/update RPC и до появления хотя бы одного command receipt.

Rollback сам блокируется, если:

- существует `leader_read_installation_job_rpc`;
- существует `leader_update_installation_job_rpc`;
- receipts table не пуста; точный stop code — `command_receipts_not_empty`.

Rollback удаляет только четыре объекта этого кандидата. `leader_private` schema и любые сторонние объекты сохраняются. не выполнять broad schema drop.

## Production boundary

- Production database migration не применялась.
- Production Edge не развёртывался.
- Production frontend не переключался.
- Auth и данные не изменялись.
- `nav_*` не изменялся.
