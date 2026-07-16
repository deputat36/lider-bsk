# Staging-проверка `leader-crm-orders` — 16 июля 2026 года

## Окружение

- Production: `ofewxuqfjhamgerwzull` — изменения запрещены без отдельного approval.
- Staging: `otulfnouybahfnsycxqn` — `lider-bsk-staging`.
- Назначение staging: изолированная проверка schema, RPC и Edge-контрактов без production data.
- GitHub source: commit `4dafa2723c1018574572d9a91441cf382ac25b34`.

## Что выполнено

В staging применена migration:

`staging_orders_edge_projection_compat_20260716`

Репозиторный снимок:

`supabase/staging-migrations/20260716_01_crm_orders_edge_projection_compat.sql`

Migration проверяет `leader_staging.environment_guard` до DDL и добавляет семь полей совместимости в `public.leader_orders`:

- `client_id`;
- `source`;
- `layout_comment`;
- `current_stage`;
- `next_action`;
- `progress_percent`;
- `installation_status`.

Типы и nullable/default-семантика соответствуют production schema, но production DDL не выполнялся.

## Edge Function

В staging развёрнута:

- slug: `leader-crm-orders`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployed SHA-256: `597b692c4ced7904b627fdb9949d8b394f835d4c529b56f506149358fd6ea1f3`.

Deployment использует pinned-wrapper:

`supabase/staging-functions/leader-crm-orders/index.ts`

Wrapper импортирует только проверенный source из commit `4dafa2723c1018574572d9a91441cf382ac25b34`. Это фиксирует точную версию RBAC matrix и role-specific projections, которая прошла GitHub CI в PR #354.

## Read-only post-deploy evidence

После migration и deploy подтверждено:

- staging orders: `0`;
- staging CRM profiles: `0`;
- staging Auth users: `0`;
- compatibility columns: `7`;
- Edge error logs: `0`;
- security advisors: только ожидаемые INFO `rls_enabled_no_policy` для закрытого harness без browser grants;
- performance advisors: только INFO об unused indexes в пустом staging;
- новых ERROR/WARN findings нет.

Production Edge versions, migrations, policies, grants, Auth и данные не менялись.

## Authenticated E2E runner

Runner:

`tools/run_crm_orders_staging_auth_e2e.mjs`

Он:

- разрешает только точный URL `https://otulfnouybahfnsycxqn.supabase.co`;
- получает временный user JWT через password sign-in;
- вызывает только `/functions/v1/leader-crm-orders`;
- не использует service role;
- не печатает email, пароль, publishable key или JWT;
- проверяет exact manager/accountant response projections;
- выполняет best-effort logout.

Поддерживаемые сценарии:

1. `manager_list_projection`;
2. `manager_allowed_update`;
3. `manager_finance_update_forbidden`;
4. `accountant_list_projection`;
5. `accountant_payment_update`;
6. `accountant_mixed_update_forbidden`;
7. `restricted_role_list_forbidden`;
8. `inactive_profile_forbidden`.

## Почему HTTP E2E пока не запущен

В staging сейчас нет Auth users и активных CRM profiles. Вставлять пользователей напрямую в `auth.users` запрещено. Для реального HTTP E2E нужен временный staging user, созданный через Supabase Dashboard, соответствующий synthetic profile и один synthetic order.

Необходимые environment variables:

- `LIDER_STAGING_SUPABASE_URL`;
- `LIDER_STAGING_PUBLISHABLE_KEY`;
- `LIDER_STAGING_EMAIL`;
- `LIDER_STAGING_PASSWORD`;
- `LIDER_STAGING_SCENARIO`;
- `LIDER_STAGING_ORDER_ID` для projection/update-сценариев.

Пример запуска:

```powershell
$env:LIDER_STAGING_SUPABASE_URL = "https://otulfnouybahfnsycxqn.supabase.co"
$env:LIDER_STAGING_PUBLISHABLE_KEY = "<staging publishable key>"
$env:LIDER_STAGING_EMAIL = "<temporary staging user>"
$env:LIDER_STAGING_PASSWORD = "<temporary password>"
$env:LIDER_STAGING_SCENARIO = "manager_list_projection"
$env:LIDER_STAGING_ORDER_ID = "<synthetic order uuid>"
node tools/run_crm_orders_staging_auth_e2e.mjs
```

После тестов требуется удалить synthetic order, CRM profile, Auth user и sessions и повторно подтвердить нулевые counts.

## Production boundary

Без отдельного подтверждения запрещены:

- deploy `leader-crm-orders` в production;
- применение staging migration к production;
- копирование production data или Auth users;
- изменение production RLS, grants, policies или данных;
- использование production credentials в runner.
