# CRM production board registry summary — manual test 2026-07-12

Related: #200, #204, #205, #217.

Mode: browser and Network verification only. Do not create or rewrite production rows for this test.

## Read-only baseline

At the source-change checkpoint:

- `leader_production_jobs.production_status`: `Не передано` — 1, `В производстве` — 1;
- `leader_installation_jobs.install_status`: `Запланирован` — 1;
- live unknown production/installation statuses — 0.

Repeat the read-only query before comparing counts because production data may change.

## Browser steps

1. Sign in with an owner/admin or manager account that may open both production kinds.
2. Open `?tab=production`.
3. Wait for `leader-v4:production-board-rendered` and the alert refresh.
4. Verify the summary cards `Производство открыто`, `Монтаж открыт` and `Просрочено` use registry-backed values.
5. Switch between `Производство` and `Монтаж`; visible overdue labels must match the registry-backed deadline calculation.
6. A production status `Готово` is treated as completed for production workload even though issue/hand-off may still follow.
7. Canonical terminal values `Выдано`, `Не требуется`, `Отменено`, `Выполнен` and `Отменён` must not be marked overdue.
8. Legacy values supported by the editor remain readable through their canonical keys.
9. In a development branch only, use a synthetic value such as `Legacy Production State` or `Legacy Installation State`: it must be visibly marked as unknown and remain in open control.
10. Refresh the board and confirm the correction remains stable without duplicate alert lines or overdue labels.

## Network contract

The registry correction may read only:

- `leader_production_jobs`: `id,production_status,deadline`;
- `leader_installation_jobs`: `id,install_status,scheduled_at`.

It must not request client name, phone, email, message, address, order JSON, internal comments, prices, costs or profit.

The correction must not issue INSERT, UPDATE, DELETE, UPSERT, RPC or Edge Function requests.

## Pass criteria

- summary values are corrected after board render;
- unknown raw values are not treated as completed;
- unknown raw values are not rewritten;
- completed jobs are not marked overdue;
- visible overdue labels match the read-only metrics;
- no additional write path exists;
- no console error appears;
- `nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched.

Manual verification remains required before closing #217.
