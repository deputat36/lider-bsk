# Staging deploy calculation.create_version — 2026-07-15

## Окружения

- Production: `ofewxuqfjhamgerwzull`.
- Staging: `otulfnouybahfnsycxqn`.
- Deploy и DDL выполнялись только в staging.
- `supabase/config.toml` продолжает указывать на production project ID; это не использовалось для автоматического production rollout.

## GitHub chain

- PR #327 / `1d0a00b0bdd9fab12c05d938ebf017c9e01a50ed` — source-only RPC и Edge candidate.
- PR #329 / `7783c03b4c5918695fd439a76d191503966d4157` — safe response wrapper вместо whole-row JSON.
- PR #330 / `b0debeea145d42e4f1b7d515c87e859c8b49a486` — canonical first-install migrations 04 и 05.
- PR #331 / `34f9e8060bee2887c3a4d722d34988bfaddb9089` — covering FK indexes.

PR-head CI:

- PR #327: 27/27 workflows successful.
- PR #329: 18/18 workflows successful.
- PR #330: 18/18 workflows successful.
- PR #331: 18/18 workflows successful.

GitHub connector не вернул отдельный набор main-push runs для squash-коммитов, поэтому PR CI подтверждён, а main-push Actions отдельно не подтверждены.

## Applied staging migrations

Фактический migration history staging:

- `20260715153753 staging_calculation_version_install_20260715`;
- `20260715153930 staging_calculation_version_grant_hardening_20260715`;
- `20260715155505 staging_calculation_version_fk_indexes_20260715`.

Reference migrations 02 и 03 в staging не применялись. Чистая установка выполнена canonical migration 04, чтобы не существовало промежуточного public RPC с whole-row response.

## Database objects

Созданы только в staging:

- `public.leader_lead_calculations`;
- `public.leader_lead_calculation_items`;
- `leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)`;
- `public.leader_create_calculation_version_rpc(jsonb)`;
- unique index `leader_lead_calculations_lead_version_uidx`;
- FK indexes `leader_lead_calculations_need_id_idx` и `leader_lead_calculation_items_lead_id_idx`;
- supporting lead/created and calculation/sort indexes.

Обе функции:

- `SECURITY INVOKER`;
- `search_path=''`;
- `anon` и `authenticated` не имеют EXECUTE;
- `service_role` имеет EXECUTE.

Таблицы:

- RLS включён;
- browser roles не имеют SELECT/INSERT/UPDATE/DELETE;
- `service_role` имеет только SELECT и INSERT;
- `service_role` не имеет UPDATE и DELETE.

## Persistence contract

`calculation.create_version`:

- требует active profile;
- разрешён только ролям owner/admin/manager;
- использует optimistic concurrency через `expected_updated_at`;
- блокирует исходный расчёт и namespace заявки;
- использует advisory lock по idempotency key;
- назначает версию как `max(version_number) + 1`;
- отклоняет существующие дубли номеров версий;
- вычисляет суммы, прибыль, наценку и маржу только на сервере;
- создаёт расчёт, позиции и command receipt атомарно;
- не изменяет исходную версию;
- не переносит `commercial_offer_id` и `order_id` на новую черновую версию;
- сохраняет только safe response projection в receipt;
- replay возвращает ту же safe projection.

Safe calculation response не содержит:

- `created_by`;
- `updated_by`;
- `commercial_offer_id`;
- `order_id`.

Safe item response не содержит:

- `calculation_id`;
- `lead_id`.

## SQL acceptance

В staging успешно выполнены два транзакционных acceptance scripts с итоговым `ROLLBACK`:

1. `20260715_calculation_version_acceptance.sql`:
   - create version 2;
   - server-side totals;
   - immutable source;
   - exact replay;
   - modified payload with same key → idempotency conflict;
   - negative profit → invalid totals;
   - no extra versions after failed commands;
   - success receipt exists.
2. `20260715_calculation_version_safe_response.sql`:
   - exact calculation allowlist;
   - exact item allowlist;
   - server-owned fields absent;
   - receipt stores safe response;
   - replay projection is unchanged;
   - browser EXECUTE denied;
   - service-role EXECUTE present.

После обоих tests:

- profiles — 0;
- leads — 0;
- needs — 0;
- calculations — 0;
- calculation items — 0;
- command receipts — 0.

Synthetic fixtures были откатаны транзакцией. Auth users не создавались.

## Advisors

Security advisors после rollout:

- WARN/ERROR — 0;
- остаются только INFO `RLS Enabled No Policy` для закрытых таблиц без browser grants.

Performance advisors после migration 06:

- WARN/ERROR — 0;
- `unindexed_foreign_keys` для calculation tables отсутствуют;
- остаются только INFO `Unused Index` на пустых staging tables.

## Edge deployment

Развёрнуто только в staging:

- slug: `leader-crm-calculations`;
- id: `91b4c99c-a03e-4cfb-ad2a-0ca4de29b7ea`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployment hash: `5685a77b94f4cf742e3e14038b8d519fc13972a56553d134e6e8256815715780`.

Source имеет exact staging lock `otulfnouybahfnsycxqn` и возвращает `wrong_environment` при другом `SUPABASE_URL`.

В production функция `leader-crm-calculations` отсутствует. Production Edge Functions, database schema, data, RLS, grants, Auth и policies не менялись.

## HTTP E2E status

Не подтверждено:

- authenticated HTTP 201 create;
- exact replay HTTP 200;
- modified payload HTTP 409;
- forbidden role HTTP 403;
- inactive profile HTTP 403.

Причина: staging содержит 0 Auth users, а подключённый Supabase connector не предоставляет безопасные create/delete Auth user operations.

Попытка внешнего unauthenticated smoke из текущего execution container не достигла Supabase из-за DNS resolution failure. Edge logs остались пустыми. Этот smoke не считается пройденным и не заменяет ранее подтверждённый gateway smoke для `leader-crm-design`.

## Remaining gates

До использования browser UI требуется:

1. вручную создать временного Auth user только в staging;
2. создать active staging CRM profile с одной из ролей owner/admin/manager;
3. выполнить authenticated create/replay/conflict/forbidden/inactive tests;
4. удалить fixtures, profile, sessions и Auth user;
5. подготовить staging-only UI transport с exact environment lock;
6. отдельно принять решение о production migration, production Edge deployment и включении CRM-кнопки.

Production rollout остаётся запрещён без отдельного явного решения владельца.