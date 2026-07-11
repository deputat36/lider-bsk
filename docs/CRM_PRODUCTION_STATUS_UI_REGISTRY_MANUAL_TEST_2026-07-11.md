# CRM production status UI registry manual test — 2026-07-11

Related: #200, #202, #204, #217.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=production`

## Scope

The production job card uses the canonical `production` domain from:

`crm/v4/assets/v4/status-transitions-v1.js`

The adoption changes the existing browser write path but does not create a new endpoint, RPC, Edge Function or database object.

Production Supabase must not be modified merely to execute this checklist. A real status save must use a disposable synthetic record in an approved development branch or an explicitly approved CRM test order.

## Read-only live baseline

Observed on 2026-07-11:

### `leader_production_jobs.production_status`

- `Не передано` — 1;
- `В производстве` — 1.

### `leader_orders.production_status`

- `Не передано` — 3;
- `В производстве` — 1;
- `Выдано` — 1.

No production status row was changed during this audit.

## Registry-backed options

1. Open a production job with status `Не передано`.
2. Confirm the status select contains only:
   - `Не передано`;
   - `В очереди`;
   - `В производстве`;
   - `Не требуется`.
3. Open a job with status `В производстве`.
4. Confirm the select contains only:
   - `В производстве`;
   - `Готово`;
   - `Приостановлено`;
   - `Отменено`.
5. Confirm no direct `Не передано → Готово` or `Не передано → Выдано` option exists.
6. Confirm a terminal status such as `Выдано` contains only its current value and displays the terminal notice.

## Legacy compatibility

The previous UI used these raw values:

- `Передано в производство` → canonical `В очереди`;
- `В работе` → canonical `В производстве`;
- `Проблема` → canonical `Приостановлено`.

For a local/synthetic fixture with one of these values:

1. Confirm the original raw value remains selected.
2. Confirm the UI shows the canonical interpretation as a legacy notice.
3. Save an unrelated field without changing status.
4. Confirm the raw legacy status is preserved exactly.
5. Select a different allowed target and confirm only the new target is written using its canonical label.

Do not create a legacy row in production for this test.

## Unknown raw value

For a local/synthetic fixture with `Legacy Custom Production`:

1. Confirm the raw value is visible.
2. Confirm the select contains only `Неизвестный статус: Legacy Custom Production`.
3. Confirm saving another field preserves the raw value exactly.
4. Confirm changing to another status is blocked before any Supabase request.
5. Confirm the warning says that mapping must be added to the registry.

Do not insert or update an unknown production status in production.

## Write-path checks

On a disposable approved record:

1. Open DevTools → Network.
2. Select an allowed transition.
3. Click `Сохранить`.
4. Confirm validation completes before the first PATCH/POST request.
5. Confirm the job update uses the canonical target label.
6. Confirm the linked order receives the same canonical `production_status`.
7. Confirm the event row contains the original old status and stored new status.
8. Repeat with a forbidden transition through DOM manipulation.
9. Confirm no job/order/event write is emitted for the forbidden transition.

## Timestamp checks

The live table has these relevant columns:

- `sent_to_contractor_at`;
- `ready_at`;
- `issued_at`;
- `updated_at`.

It does not have `started_at`.

Expected mapping:

- transition to `В очереди` or `В производстве` → set `sent_to_contractor_at` only when empty;
- transition to `Готово` → set `ready_at` only when empty;
- transition to `Выдано` → set `issued_at` only when empty;
- unchanged status → do not add a transition timestamp.

## Privacy and role checks

Confirm the existing restrictions remain intact:

- designer/contractor do not receive customer contacts;
- cost fields remain absent for roles with `hide_costs`;
- internal comments and employee email remain absent for restricted roles;
- a role without production access cannot open or save a production job;
- the status model itself performs no Supabase request.

## Pass criteria

- options are derived from the canonical production registry;
- legacy raw values remain readable and are not rewritten on render or unrelated save;
- unknown raw values remain visible and cannot transition;
- terminal and forbidden transitions are rejected before the existing write path;
- only canonical labels are written for real transitions;
- timestamps use only existing columns;
- no historical status backfill is performed;
- no production DDL, migration, RLS, grants, Auth, Storage or Edge deploy is required;
- `nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched.
