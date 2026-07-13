# Валидация staging design task RPC — 2026-07-13

## Контур

- Organization: `Lider` / `tcbupmmcojrcxfqjuwsm`.
- Production: `ofewxuqfjhamgerwzull`.
- Staging: `otulfnouybahfnsycxqn`.
- Проверки и DDL выполнялись только в staging.
- Production data в staging не переносились.
- Edge Functions не разворачивались.

## Созданные staging-объекты

- `leader_staging.environment_guard`;
- `leader_private.leader_command_receipts`;
- минимальные dependency tables `leader_user_profiles`, `leader_leads`, `leader_orders`, `leader_lead_needs`, `leader_production_jobs`;
- `leader_design_tasks`;
- `leader_design_task_events`;
- partial unique index `leader_design_tasks_one_active_per_order_uidx`;
- RPC `leader_create_design_task_from_order_rpc(jsonb)`;
- covering indexes для foreign keys.

Все business-таблицы имеют RLS. `anon` и `authenticated` не имеют прямых grants. RPC является `SECURITY INVOKER`, имеет пустой `search_path` и доступна только `service_role`.

## Найденная и исправленная ошибка

Первый синтетический вызов до создания business rows выявил неоднозначную ссылку `action=action` в компактной staging-реализации receipt lookup.

Исправление:

- все PL/pgSQL variables получили префикс `v_`;
- table columns квалифицированы aliases;
- RPC повторно создана отдельной staging migration;
- повторный вызов успешно завершился.

Canonical GitHub harness изначально использовал `v_action` / `v_idempotency_key`; production-код не изменялся.

## Пройденные проверки

Успешный вызов:

- создал одну design task;
- создал один privacy-safe audit event;
- создал один completed receipt;
- вернул status `Новая` и layout status `Макет не начат`;
- вернул четыре advisory warning для неполной потребности;
- не изменил order status, layout, production, payment или finance fields.

Idempotency и конфликты:

- exact replay вернул `idempotent_replay=true`;
- тот же key с другим hash вернул `conflict`;
- новая key при существующей active task вернула `conflict`;
- replay/conflict не создали дубликаты.

Access и evidence:

- accountant → `forbidden`;
- inactive profile → `access_denied`;
- stale `updated_at` → `conflict`;
- `need_design=false` → `validation_error`;
- need другой заявки → `not_found`;
- production job другого заказа → `not_found`;
- client-supplied `task_status` / `created_by` → `validation_error` без receipt.

Status policy:

- завершённая задача сохранилась как история и разрешила новую активную задачу;
- неизвестный raw task status был признан active и заблокировал создание.

Atomic rollback:

- принудительная ошибка INSERT audit event → `persistence_failed`, task/event/receipt = 0;
- принудительная ошибка completion receipt → `persistence_failed`, task/event/receipt = 0;
- тестовые triggers и functions после сценариев удалены.

Privacy:

- sentinel client names, phones, finance values, internal comments и `order.data` отсутствуют в response, task и stored receipt;
- `owner_id`, `created_by`, payment fields отсутствуют в safe response projection.

## Очистка

После тестов точечно удалены все synthetic fixtures.

Итоговые staging rows:

- profiles — 0;
- leads — 0;
- orders — 0;
- needs — 0;
- production jobs — 0;
- design tasks — 0;
- design events — 0;
- receipts — 0;
- environment guard — 1;
- test failure triggers — 0.

## Advisors

Security advisor после hardening:

- WARN/ERROR — 0;
- остались только INFO `RLS Enabled No Policy`.

Это ожидаемо для изолированного harness: browser roles лишены table grants, а `service_role` работает через server RPC. Платформенная `public.rls_auto_enable()` была доступна Data API roles; EXECUTE для PUBLIC/anon/authenticated отозван, автоматический event trigger сохранён.

Performance advisor после hardening:

- unindexed foreign keys — 0;
- остались только INFO `Unused Index`, ожидаемые на пустом staging.

## Production boundary

Не выполнялись:

- production DDL/DML;
- production migration;
- production RPC или Edge deploy;
- изменение production RLS/grants/policies;
- production backfill;
- копирование production data.

Следующий безопасный этап — source-only Edge Function route и staging deploy после GitHub CI. Production rollout остаётся отдельным approval gate.
