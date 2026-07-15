# Консолидированная staging-установка версий расчёта

Дата: 15 июля 2026 года.

Статус: staging rollout candidate. Production не затрагивается.

## Причина консолидации

Файлы `20260715_02` и `20260715_03` были подготовлены последовательно: сначала persistence RPC, затем safe-response wrapper. На чистом staging-проекте это создавало бы короткое промежуточное состояние, в котором public RPC уже существует, но safe projection ещё не применена.

Edge Function в этот момент не развёртывается, однако для более строгого fail-closed rollout подготовлена единая first-install migration:

`supabase/staging-migrations/20260715_04_calculation_version_install.sql`.

Она сразу создаёт конечное состояние без промежуточного public whole-row ответа.

## Что устанавливает migration 04

- `public.leader_lead_calculations`;
- `public.leader_lead_calculation_items`;
- уникальный индекс `(lead_id, version_number)`;
- индексы загрузки версий и строк;
- RLS на обеих таблицах;
- private persistence RPC `leader_private.leader_create_calculation_version_rpc_internal_v1(jsonb)`;
- public RPC wrapper `public.leader_create_calculation_version_rpc(jsonb)`;
- service-role-only EXECUTE;
- пустой `search_path`;
- `SECURITY INVOKER`;
- advisory locks по idempotency key и lead;
- optimistic concurrency через `expected_updated_at`;
- server-side totals;
- атомарный calculation + items + receipt;
- явный allowlist полей успешного ответа;
- safe response в idempotency receipt;
- PostgREST schema reload.

Migration 04 подходит как для чистого staging, так и для частично подготовленного контура: `CREATE TABLE IF NOT EXISTS` и `CREATE OR REPLACE FUNCTION` приводят функции к конечной версии.

## Обязательный grant hardening

Supabase Data API использует grants отдельно от RLS. В существующем проекте default privileges могут автоматически дать `service_role` более широкие права на новую public-таблицу.

Поэтому сразу после migration 04 и до любых тестов или Edge deployment применяется:

`supabase/staging-migrations/20260715_05_calculation_version_grant_hardening.sql`.

Migration 05:

1. Отзывает все права на обе таблицы у `public`, `anon`, `authenticated`, `service_role`.
2. Возвращает `service_role` только `SELECT, INSERT`.
3. Проверяет отсутствие browser access.
4. Проверяет наличие необходимых service-role прав.
5. Проверяет отсутствие `UPDATE, DELETE` у `service_role`.

Источник расчёта и его строки поэтому невозможно изменить или удалить через service-role Data API.

## Канонический порядок rollout

Для чистого staging применяются только:

1. `20260715_04_calculation_version_install.sql`;
2. `20260715_05_calculation_version_grant_hardening.sql`;
3. `20260715_calculation_version_acceptance.sql`;
4. `20260715_calculation_version_safe_response.sql`;
5. read-only verification запросы;
6. security advisors;
7. performance advisors;
8. только затем deployment `leader-crm-calculations`.

`20260715_02` и `20260715_03` остаются проектной историей и reference implementation. На чистом staging они не применяются, если применяется migration 04.

## Безопасный ответ

Расчёт возвращает только:

- идентификаторы расчёта, заявки, потребности и клиента;
- заголовок, статус и номер версии;
- суммы, прибыль и маржу;
- warning level и warnings;
- public/internal comments;
- timestamps.

Не возвращаются:

- `created_by`;
- `updated_by`;
- `commercial_offer_id`;
- `order_id`.

Позиция не возвращает:

- `calculation_id`;
- `lead_id`.

## Принцип неизменности

На таблицы расчётов `service_role` получает только `SELECT, INSERT`.

RPC создаёт новую версию отдельной записью. Исходная версия и её строки не обновляются и не удаляются. Связи исходной версии с КП и заказом сохраняются.

## Проверка после применения

Необходимо подтвердить:

- environment guard;
- наличие двух таблиц и двух функций;
- RLS enabled;
- browser grants отсутствуют;
- service-role UPDATE/DELETE отсутствуют;
- public wrapper и private function доступны только service-role;
- основной acceptance завершился без ошибки и откатил fixtures;
- safe-response acceptance завершился без ошибки и откатил fixtures;
- таблицы и receipts пусты после тестов;
- security advisors не содержат WARN/ERROR;
- performance advisors не содержат новых actionable WARN/ERROR.

## Edge deployment

Edge Function развёртывается только после успешной базы и advisors:

- slug: `leader-crm-calculations`;
- project: `otulfnouybahfnsycxqn`;
- `verify_jwt=true`;
- staging project lock внутри функции;
- public RPC-only persistence.

## Production boundary

Не выполняются:

- production DDL/DML;
- исправление исторического дубля production;
- production unique index;
- production RPC;
- production Edge deployment;
- подключение кнопки browser UI.

Production rollout остаётся отдельным approval gate после полного staging evidence.