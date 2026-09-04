# CRM catalog production rollout readiness — 2026-09-04

Issue: #152

## Текущее состояние

Staging write-path находится в `main` после PR #502:

- atomic create/update каталога;
- `leader_catalog_price_logs`;
- canonical `catalog.manage`;
- idempotency receipts;
- optimistic concurrency через `expected_updated_at`;
- JWT Edge `leader-crm-catalog`, `verify_jwt=true`;
- owner/admin UI в exact staging;
- production UI остаётся read-only.

Дополнительно 2026-09-04 выполнен отдельный authenticated staging E2E через реального временного Auth user:

- manager login → `catalog.manage` через Edge → `403 forbidden`;
- тот же synthetic user переключён bootstrap-механизмом в owner;
- owner login → create → idempotent replay → update;
- authenticated read-back `leader_catalog` подтвердил сохранённые поля;
- authenticated read-back `leader_catalog_price_logs` подтвердил `created` + `price_update`;
- stale update с исходным `expected_updated_at` → `409 source_changed`;
- inspect перед cleanup: `catalog=1`, `catalog_logs=2`, `catalog_receipts=2`;
- cleanup удалил catalog/log/receipt fixture и временного Auth user;
- финальный run `33874631100` — success по всем шагам.

Первый authenticated run выявил реальный дефект stale-path: `permission denied for table leader_command_receipts`. Причина — business RPC была `SECURITY INVOKER`, а canonical receipts layer намеренно не выдаёт `DELETE` на таблицу `service_role`. Исправление не расширяет table grants: добавлен узкий `leader_private.leader_discard_catalog_command_receipt(uuid,uuid)` — `SECURITY DEFINER`, service-role-only helper, удаляющий только `in_progress` receipt действия `catalog.manage` указанного actor. Публичная `leader_manage_catalog_rpc(jsonb)` остаётся `SECURITY INVOKER`; authenticated/anon не могут выполнять ни helper, ни business RPC; `service_role` по-прежнему не имеет table-level DELETE на `leader_command_receipts`.

## Production preflight

Production сейчас не готов к catalog write rollout, потому что read-only introspection 2026-09-04 подтвердил отсутствие:

- `leader_private.leader_role_action_matrix_v1`;
- `leader_private.leader_command_receipts`;
- `leader_private.leader_actor_has_crm_action(uuid,text)`;
- `public.leader_actor_has_crm_action_rpc(uuid,text)`;

При этом production уже содержит рабочие `leader_catalog` и `leader_catalog_price_logs`.

Фактический production preflight:

- 69 позиций каталога;
- 0 записей в `leader_catalog_price_logs`;
- активные типы профилей: `owner/admin/manager` (2 owner, 1 admin, 1 manager);
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

Database candidate теперь включает staging-proven узкий private receipt helper `leader_discard_catalog_command_receipt` и заменяет прямые `DELETE` receipt внутри business RPC вызовом helper. Candidate специально не выдаёт table-level DELETE на `leader_private.leader_command_receipts`.

Production Edge генерируется из staging-proven реализации, но обязательно заменяет:

- staging project ref → `ofewxuqfjhamgerwzull`;
- `STAGING_PROJECT_REF` → `PRODUCTION_PROJECT_REF`;
- wrong-environment marker `expected: 'staging'` → `expected: 'production'`.

Checker запрещает оставшиеся staging project ref/constant/expected marker и прямой receipt DELETE внутри публичной business RPC.

Кандидат намеренно не включает frontend cutover: frontend остаётся read-only, пока production backend не установлен и не пройдёт authenticated smoke.

## Security contract

Catalog business RPC:

- `SECURITY INVOKER`;
- `EXECUTE` отозван у `public`, `anon`, `authenticated`;
- `EXECUTE` разрешён только `service_role`;
- RPC повторно проверяет `leader_private.leader_actor_has_crm_action(actor_id, 'catalog.manage')`;
- create/update, price log и idempotency receipt находятся в одной транзакции;
- update использует row lock и `expected_updated_at` для stale guard;
- typed failure очищает только свой `in_progress catalog.manage` receipt через private helper.

Receipt helper:

- находится в `leader_private`;
- `SECURITY DEFINER` используется только для минимальной операции удаления своего `in_progress catalog.manage` receipt;
- принимает receipt id + actor id и проверяет action/state/actor;
- `EXECUTE` отозван у `public`, `anon`, `authenticated`;
- доступен только `service_role`;
- table-level DELETE на receipts не требуется и не выдаётся.

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
- `public.leader_manage_catalog_rpc(jsonb)` и private catalog receipt helper ещё не установлены;
- production backup/rollback window согласован.

Если любой пункт не подтверждён, rollout прекращается без изменений.

## Порядок будущего production rollout

1. Получить отдельное явное разрешение владельца на production database change.
2. Применить canonical RBAC/receipts candidate, если он всё ещё отсутствует.
3. Выполнить его postflight и security advisors.
4. Получить отдельное разрешение на catalog RPC/helper.
5. Применить сгенерированный catalog RPC candidate.
6. Проверить: business RPC `SECURITY INVOKER`; authenticated/anon не имеют EXECUTE; private helper service-role-only; service_role не получил table-level DELETE на receipts.
7. Проверить atomic create/replay/update/stale/forbidden на synthetic production fixture только при отдельном разрешении на такие production test data.
8. Получить отдельное разрешение на production Edge deploy.
9. Deploy `leader-crm-catalog` с `verify_jwt=true`.
10. Выполнить authenticated Edge smoke без frontend switch.
11. Только после успешного backend smoke отдельным PR переключить production frontend с read-only на production Edge.
12. После frontend smoke закрыть #152.

## Rollback

RPC rollback удаляет:

- `public.leader_manage_catalog_rpc(jsonb)`;
- `leader_private.leader_discard_catalog_command_receipt(uuid,uuid)`.

Rollback не удаляет:

- каталог;
- историю цен;
- canonical RBAC core;
- command receipts других действий.

Edge rollback выполняется отдельным возвратом предыдущей версии/удалением только catalog Edge до frontend cutover.

Frontend rollback до момента cutover не требуется: production сейчас и в candidate остаётся read-only.

## Решение на текущем этапе

Authenticated staging E2E для catalog write-path теперь пройден. Production rollout не выполнять автоматически. Source-only candidate можно проверять и сливать в репозиторий; применение production database/Edge/frontend требует отдельных явных approvals.
