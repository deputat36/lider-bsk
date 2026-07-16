# Staging probe `leader-crm-leads:list_orders` — 16 июля 2026 года

## Назначение

Проверить в изолированном staging role gate и role-specific order projections из текущего source `leader-crm-leads`, не затрагивая production и не объявляя остальные generic lead-маршруты готовыми для staging E2E.

Окружение:

- staging project: `otulfnouybahfnsycxqn` / `lider-bsk-staging`;
- GitHub source commit: `17524ea9ef08c11b18b385b9469778d5b1084ddb`;
- source path: `supabase/functions/leader-crm-leads/index.ts`;
- source blob SHA: `259538acebd2966e39de22a61a3023aecd26d6f6`.

## Deployed staging probe

- slug: `leader-crm-leads-staging`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployed SHA-256: `89934adc7e53b63189b9629875f8a9e8ac2055b1c7663a49d5c0d4e58e48bdcc`.

Pinned-wrapper:

`supabase/staging-functions/leader-crm-leads-staging/index.ts`

Wrapper импортирует точный reviewed source из указанного commit.

## Разрешённый validation scope

В staging probe проверяется только:

- `list_orders` для manager;
- `list_orders` для accountant;
- exact manager projection;
- exact accountant projection;
- запрет `dashboard` для accountant до lead-table read;
- запрет `list_orders` для designer, installer и contractor;
- отказ неактивному профилю.

Вне scope:

- dashboard для owner/admin/manager;
- list/create/update lead;
- ensure_client;
- create_order;
- create_order_from_offer;
- ensure_profile.

Причина: staging содержит минимальный order/design/calculation harness, а не полную CRM schema. Наличие развёрнутого probe не означает готовность маршрутов вне scope.

## Read-only evidence

После deploy:

- staging orders: `0`;
- staging profiles: `0`;
- staging Auth users: `0`;
- Edge error logs: `0`.

Для `leader_orders` уже применена guarded compatibility migration из PR #355, поэтому manager/accountant SELECT projections имеют все требуемые колонки.

## Authenticated runner

Runner:

`tools/run_crm_leads_orders_staging_auth_e2e.mjs`

Сценарии:

1. `manager_list_orders_projection`;
2. `accountant_list_orders_projection`;
3. `accountant_dashboard_forbidden`;
4. `restricted_list_orders_forbidden`;
5. `inactive_profile_forbidden`.

Runner:

- блокирует URL, отличный от точного staging URL;
- использует только publishable key и временный user JWT;
- не использует service role;
- не выводит email, пароль, ключ или JWT;
- проверяет exact response keys;
- выполняет best-effort logout.

Authenticated HTTP E2E пока не запущен, потому что временные Auth users, CRM profiles и synthetic order отсутствуют. Пользователей запрещено вставлять напрямую в `auth.users`.

## Production boundary

Production Supabase не изменялся. Запрещены без отдельного approval:

- production Edge deploy;
- production DDL/DML;
- перенос production data/Auth в staging;
- изменение production RLS, policies, grants или данных.
