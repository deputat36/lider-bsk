# CRM installation status UI registry manual test — 2026-07-11

Related: #200, #202, #204, #217.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=production`

## Scope

The installation job card uses the canonical `installation` domain from:

`crm/v4/assets/v4/status-transitions-v1.js`

The adoption changes the existing browser write path but does not add a new endpoint, RPC, Edge Function or database object.

Do not change a real production installation status solely to execute this checklist. Real save tests require a disposable synthetic record in an approved development branch or an explicitly approved CRM test order.

## Read-only live baseline

Observed on 2026-07-11:

### `leader_installation_jobs.install_status`

- `Запланирован` — 1.

### `leader_orders.installation_status`

- `NULL` — 2;
- `Запланирован` — 1;
- `Не назначен` — 1;
- `Не требуется` — 1.

No installation row was changed during the audit.

## Registry-backed options

1. For NULL or `Не назначен`, confirm the select contains only:
   - `Не назначен`;
   - `Запланирован`;
   - `Не требуется`;
   - `Отменён`.
2. For `Запланирован`, confirm the select contains only:
   - `Запланирован`;
   - `В работе`;
   - `Перенесён`;
   - `Отменён`.
3. For `В работе`, confirm the select contains only:
   - `В работе`;
   - `Выполнен`;
   - `Перенесён`;
   - `Отменён`.
4. Confirm a terminal status such as `Выполнен`, `Не требуется` or `Отменён` has no outgoing transition.
5. Confirm no direct `Не назначен → Выполнен` option exists.

## NULL preservation

For a synthetic record with `install_status = NULL`:

1. Confirm the UI displays `Не назначен (raw: NULL)`.
2. Edit an unrelated field without changing status.
3. Confirm the stored value remains NULL.
4. Select `Запланирован` and confirm only then the canonical text is written.

Do not create or update a NULL production record for this check.

## Legacy compatibility

The previous UI used:

- `Нужно назначить` → canonical `Не назначен`;
- `Проблема` → canonical `Перенесён`.

For a local/synthetic fixture:

1. Confirm the original raw value remains selected.
2. Confirm the canonical interpretation is shown in a legacy notice.
3. Save another field without changing status.
4. Confirm the legacy raw value is preserved exactly.
5. Select a different allowed target and confirm the new value is stored with its canonical label.

## Unknown raw value

For a local/synthetic fixture with `Legacy Custom Installation`:

1. Confirm the exact raw value is visible.
2. Confirm the select contains only `Неизвестный статус: Legacy Custom Installation`.
3. Confirm unrelated edits preserve the raw value.
4. Confirm a transition to another status is blocked before any Supabase request.
5. Confirm the warning requires explicit registry mapping.

## Write-path checks

On an approved synthetic record:

1. Open DevTools → Network.
2. Select an allowed transition and click `Сохранить`.
3. Confirm validation runs before the job PATCH.
4. Confirm the job receives the canonical target label.
5. Confirm the linked order receives the same canonical `installation_status`.
6. Confirm the event stores the original old status and the stored new status.
7. Force a forbidden target via DOM manipulation.
8. Confirm no job/order/event write is emitted.

## Timestamp checks

The live installation table has:

- `scheduled_at`;
- `started_at`;
- `completed_at`;
- `updated_at`.

It does not have `postponed_at` or `cancelled_at`.

Expected behavior:

- the schedule date remains controlled by the existing date input;
- transition to `В работе` sets `started_at` only when empty;
- transition to `Выполнен` sets `completed_at` only when empty;
- unchanged status adds no transition timestamp;
- no write to missing timestamp columns occurs.

## Privacy and role checks

Confirm existing restrictions remain intact:

- installer receives only installation jobs;
- customer contacts are not shown;
- cost fields remain hidden for restricted roles;
- internal comments remain hidden for restricted roles;
- a role without installation access cannot open or save the card;
- the status model itself performs no Supabase request.

## Pass criteria

- options are generated from the canonical installation registry;
- NULL, legacy and unknown raw values are not rewritten during unrelated edits;
- real transitions write canonical labels;
- forbidden, terminal and unknown transitions are rejected before writes;
- timestamps use only existing columns;
- no historical status backfill is performed;
- no production DDL, DML outside an explicitly approved test record, migration, RLS, grants, Auth, Storage or Edge deploy is required;
- `nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched.
