# Staging deploy calculation.create_version

Первичная установка: 15 июля 2026 года. Актуализация авторизации: 21 июля 2026 года.

## Окружения

- Production: `ofewxuqfjhamgerwzull`.
- Staging: `otulfnouybahfnsycxqn`.
- Все DDL и Edge deploy этого контура выполнялись только в staging.
- `supabase/config.toml` продолжает указывать на production project ID и не использовался для автоматического rollout.

## Историческая GitHub chain

- PR #327 — source-only RPC и Edge candidate.
- PR #329 — safe response wrapper.
- PR #330 — canonical first-install migrations.
- PR #331 — covering FK indexes.
- PR #332/#333 — deployment и acceptance evidence.
- PR #334 — browser staging transport и permission label.
- Issue #415 — переход Edge authorization на canonical database registry.

## Applied staging migrations

Фактический installation history сохранён:

- `20260715153753 staging_calculation_version_install_20260715`;
- `20260715153930 staging_calculation_version_grant_hardening_20260715`;
- `20260715155505 staging_calculation_version_fk_indexes_20260715`.

Reference migrations 02 и 03 не применялись как промежуточный production-like путь. Чистая установка выполнена canonical migration 04, чтобы публичный RPC никогда не выдавал whole-row response.

## Database objects

Только в staging созданы:

- `public.leader_lead_calculations`;
- `public.leader_lead_calculation_items`;
- `leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)`;
- `public.leader_create_calculation_version_rpc(jsonb)`;
- unique index `leader_lead_calculations_lead_version_uidx`;
- FK indexes для `need_id` и calculation items.

Business RPC:

- `SECURITY INVOKER`;
- `search_path=''`;
- anon/authenticated не имеют EXECUTE;
- service_role имеет EXECUTE;
- таблицы закрыты от browser write;
- service_role не имеет UPDATE/DELETE расчётных таблиц.

## Persistence contract

`calculation.create_version`:

- использует optimistic concurrency через `expected_updated_at`;
- блокирует исходный расчёт и namespace заявки;
- применяет advisory lock;
- назначает `max(version_number) + 1`;
- отклоняет дубли номеров версий;
- вычисляет суммы, прибыль, наценку и маржу сервером;
- создаёт расчёт, позиции и receipt атомарно;
- не изменяет исходную версию;
- сохраняет safe response projection;
- exact replay возвращает ту же safe projection.

## Canonical authorization

С 21 июля 2026 года Edge Function не читает профиль напрямую и не содержит локальный allowlist ролей.

Цепочка:

1. `verify_jwt=true`;
2. Auth user verification;
3. payload validation;
4. service-role-only `public.leader_actor_has_crm_action_rpc`;
5. permission `calculations.write`;
6. transactional `leader_create_calculation_version_rpc`.

Источники решения:

- `leader_private.leader_role_action_matrix_v1`;
- `leader_private.leader_actor_has_crm_action(uuid,text)`.

Эффективно разрешены active owner/admin/manager. Accountant, designer, installer, contractor, inactive и unknown fail closed. Browser role parameter отсутствует.

## SQL acceptance

Сохранены два транзакционных acceptance scripts с итоговым `ROLLBACK`:

1. `20260715_calculation_version_acceptance.sql`:
   - create version;
   - server-side totals;
   - immutable source;
   - replay;
   - idempotency conflict;
   - invalid totals;
   - no extra versions after failures.
2. `20260715_calculation_version_safe_response.sql`:
   - exact allowlists ответа;
   - server-owned поля отсутствуют;
   - receipt хранит safe response;
   - browser EXECUTE denied;
   - service-role EXECUTE present.

Canonical permission transaction test дополнительно подтвердил:

- owner/admin/manager — `calculations.write=true`;
- остальные canonical roles — false;
- inactive owner — false;
- unknown role — false;
- synthetic profiles after rollback = 0.

## Active Edge deployment

- slug: `leader-crm-calculations`;
- id: `91b4c99c-a03e-4cfb-ad2a-0ca4de29b7ea`;
- version: `5`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployment hash: `4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4`;
- canonical permission `calculations.write`;
- exact staging lock `otulfnouybahfnsycxqn`.

## Superseded deployments

- v2 — недопустимый rollback из-за packaging typo; не использовался.
- v3 — валидированный локальный role-guard, допустим только как аварийный исторический rollback.
- v4 — canonical runtime gate, но bundle ещё содержал неиспользуемый legacy role helper; предпочтительный быстрый rollback.
- v5 — текущий чистый bundle без локального role helper.

## Advisors

После изменений авторизации новые DDL не выполнялись.

- Security WARN/ERROR — 0.
- Performance WARN/ERROR — 0.
- остаются только ранее известные INFO notices staging-контура.

## HTTP E2E

Authenticated HTTP 201/200/409/403 пока не подтверждён, потому что временный staging Auth user не создавался. Unit-тесты и SQL matrix test не подменяют этот smoke test.

Для E2E потребуется отдельный временный пользователь только в staging, active profile, synthetic fixtures и полная очистка после проверки.

## Production boundary

В production отсутствует `leader-crm-calculations` staging rollout.

Не выполнялись:

- production Edge deploy;
- production DDL/DML;
- production RLS/grants/functions changes;
- Auth/Storage/secrets changes;
- исправление исторических дублей;
- создание или изменение рабочих расчётов.

Production rollout остаётся запрещён без отдельного явного решения владельца, production migration/rollback plan и authenticated role smoke test.
