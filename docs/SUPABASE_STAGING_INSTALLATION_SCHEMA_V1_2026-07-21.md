# Staging installation schema v5

Дата reconciliation: 21 июля 2026 года.

## Результат

Staging installation schema полностью совпадает с read-only production baseline по четырём таблицам, семантике внешних ключей и девяти canonical-индексам.

Контуры:

- staging: `otulfnouybahfnsycxqn`;
- production baseline read-only: `ofewxuqfjhamgerwzull`;
- repository: `deputat36/lider-bsk`.

## Применённые migrations

- `20260721191810` — `staging_installation_job_update_rpc_20260721`;
- `20260721195259` — `staging_installation_command_compat_20260721`;
- `20260721200142` — `staging_installation_schema_indexes_reconcile_20260721`.

Source последнего reconciliation:

`supabase/staging-migrations/20260721_08_installation_items_order_index_candidate.sql`

Файл сохранил историческое имя `candidate`, но теперь содержит пометку фактически применённой migration и идемпотентный source.

## Исправленный drift

Три связи `order_id` используют `ON DELETE SET NULL`:

- `leader_installation_jobs.order_id`;
- `leader_installation_job_items.order_id`;
- `leader_installation_events.order_id`.

Подтверждены все девять canonical-индексов, включая:

- `leader_installation_job_items_order_id_idx`;
- `leader_installation_events_order_id_idx`;
- `leader_installation_items_job_idx`;
- `leader_installation_comments_job_idx`.

Missing FK-index advisory больше не возвращается. Performance Advisor показывает только ожидаемые `unused_index` INFO, поскольку installation tables пусты.

## Доступ и postflight

- RLS включён;
- browser policies отсутствуют;
- `public`, `anon`, `authenticated` не имеют table privileges;
- `leader_update_installation_job_rpc` доступна только `service_role`;
- RPC: SECURITY INVOKER, `search_path=''`;
- jobs/items/events/comments: `0`;
- command receipts: `0`;
- RPC fingerprint: `0ed4669197dac1f2695e763d0eec54e1`, 19061 bytes;
- Edge logs: ошибок нет;
- security ERROR/WARN: нет.

Rollback-safe smoke после DDL подтвердил `installation_job.update`, синхронизацию заказа и idempotent replay без второго события.

## Production boundary

Production исследован только read-only. В production отсутствуют installation RPC, reconciliation migrations и Edge `leader-crm-installation`. Рабочие данные, RLS, grants, Auth, Storage, secrets и `nav_*` не менялись.

## Следующий gate

Schema reconciliation завершён. Перед переключением staging frontend остаётся выполнить user-JWT smoke. Production rollout требует отдельного явного согласования.
