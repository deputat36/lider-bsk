# CRM catalog production rollout readiness — 2026-09-04

Issue: #152

## Текущее состояние

Staging write-path доказан и находится в `main` после PR #502:

- atomic create/update каталога;
- `leader_catalog_price_logs`;
- canonical `catalog.manage`;
- idempotency receipts;
- optimistic concurrency через `expected_updated_at`;
- JWT Edge `leader-crm-catalog`, `verify_jwt=true`;
- owner/admin UI в exact staging;
- production UI остаётся read-only.

Production сейчас не готов к catalog write rollout, потому что read-only introspection 2026-09-04 подтвердил отсутствие:

- `leader_private.leader_role_action_matrix_v1`;
- `leader_private.leader_command_receipts`;
- `leader_private.leader_actor_has_crm_action(uuid,text)`;
- `public.leader_actor_has_crm_action_rpc(uuid,text)`;

При этом production уже содержит рабочие `leader_catalog` и `leader_catalog_price_logs`.

Фактический production preflight на 2026-09-04:

- 69 позиций каталога;
- 0 записей в `leader_catalog_price_logs`;
- активные типы профилей в production: `owner/admin/manager` (2 owner, 1 admin, 1 manager);
- `pgcrypto` установлен в схеме `extensions`;
- `leader_catalog` имеет `trg_leader_catalog_updated_at`;
- `leader_catalog_price_logs.catalog_id` связан с `leader_catalog(id) ON DELETE CASCADE`;
- `public.leader_manage_catalog_rpc(jsonb)` отсутствует.

Production Supabase не изменялся: выполнены только SELECT/introspection запросы. DDL/DML/Auth/Edge deploy в `ofewxuqfjhamgerwzull` не выполнялись.

## Уже существующий prerequisite

Не создаём второй RBAC core. В репозитории уже есть source-only production candidate:

`supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql`

Он устанавливает canonical role/action matrix и durable command receipts и уже включает:

- owner → `catalog.read`, `catalog.manage`;
- admin → `catalog.read`, `catalog.manage`;
- остальные роли не получают `catalog.manage`.

До его явного production approval и успешного postflight catalog RPC устанавливать нельзя.

## Генерируемый catalog candidate

`tools/generate_crm_catalog_production_candidate.py` создаёт только build-artifacts:

1. `build/crm-catalog-production-candidate/20260904_01_catalog_management_rpc_candidate.sql`;
2. `build/crm-catalog-production-candidate/20260904_01_catalog_management_rpc_candidate_rollback.sql`;
3. production Edge candidate `edge/leader-crm-catalog/index.ts`;
4. production Edge contract;
5. `manifest.json`.

Production Edge генерируется из staging-proven реализации, но обязательно заменяет:

- staging project ref → `ofewxuqfjhamgerwzull`;
- `STAGING_PROJECT_REF` → `PRODUCTION_PROJECT_REF`;
- wrong-environment marker `expected: 'staging'` → `expected: 'production'`.

Checker запрещает оставшиеся staging project ref/constant/expected marker.

Кандидат намеренно не включает frontend cutover: frontend остаётся read-only, пока production backend не установлен и не пройдёт authenticated smoke.

## Security contract

Catalog business RPC:

- `SECURITY INVOKER`;
- `EXECUTE` отозван у `public`, `anon`, `authenticated`;
- `EXECUTE` разрешён только `service_role`;
- RPC повторно проверяет `leader_private.leader_actor_has_crm_action(actor_id, 'catalog.manage')`;
- create/update, price log и idempotency receipt находятся в одной транзакции;
- update использует row lock и `expected_updated_at` для stale guard.

Edge candidate:

- production project-ref fail-closed;
- должен деплоиться только с `verify_jwt=true`;
- проверяет реальный пользовательский JWT;
- проверяет canonical `catalog.manage` через service-role bridge;
- только после этого вызывает service-role-only business RPC;
- service role не передаётся в browser/frontend.

## Preflight database rollout

Перед любым применением необходимо подтвердить одновременно:

- точный project ref `ofewxuqfjhamgerwzull`;
- отсутствие `leader_staging.environment_guard`;
- наличие `leader_catalog` и `leader_catalog_price_logs`;
- наличие canonical RBAC/receipts prerequisite;
- owner/admin действительно имеют `catalog.manage`;
- `public.leader_manage_catalog_rpc(jsonb)` ещё не установлен;
- production backup/rollback window согласован.

Если любой пункт не подтверждён, rollout прекращается без изменений.

## Порядок будущего production rollout

1. Получить отдельное явное разрешение владельца на production database change.
2. Применить canonical RBAC/receipts candidate, если он всё ещё отсутствует.
3. Выполнить его postflight и security advisors.
4. Получить отдельное разрешение на catalog RPC.
5. Применить сгенерированный catalog RPC candidate.
6. Проверить, что authenticated/anon не имеют EXECUTE на business RPC, а service_role имеет.
7. Проверить atomic create/replay/update/stale/forbidden на synthetic production fixture только при отдельном разрешении на такие production test data.
8. Получить отдельное разрешение на production Edge deploy.
9. Deploy `leader-crm-catalog` с `verify_jwt=true`.
10. Выполнить authenticated Edge smoke без frontend switch.
11. Только после успешного backend smoke отдельным PR переключить production frontend с read-only на production Edge.
12. После frontend smoke закрыть #152.

## Rollback

RPC rollback удаляет только `public.leader_manage_catalog_rpc(jsonb)` и не удаляет:

- каталог;
- историю цен;
- canonical RBAC core;
- command receipts других действий.

Edge rollback выполняется отдельным возвратом предыдущей версии/удалением только catalog Edge до frontend cutover.

Frontend rollback до момента cutover не требуется: production сейчас и в candidate остаётся read-only.

## Решение на текущем этапе

Production rollout не выполнять автоматически. Source-only candidate можно проверять и сливать в репозиторий; применение production database/Edge/frontend требует отдельных явных approvals.
