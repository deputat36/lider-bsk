# CRM lead status UI registry manual test — 2026-07-11

Related: #200, #202, #204, #217.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

Mode: browser/UI/Network verification. No production data backfill or schema change is required.

## Purpose

Verify that the lead status UI uses `status-transitions-v1.js`, preserves unknown raw values and blocks transitions that are not described by the registry.

## Current read-only production evidence

At the 2026-07-11 read-only snapshot, `leader_leads.status` contains only known values:

- `Новая` — 3;
- `Уточнение деталей` — 1;
- `Расчёт подготовлен` — 2;
- `КП отправлено` — 1;
- `Создан заказ` — 5.

The unknown-status scenarios below use browser test fixtures or a development environment. Do not rewrite production rows merely to test the UI.

## Status filter

1. Log in as owner, admin or manager.
2. Open `Заявки`.
3. Confirm the status filter contains quick filters first.
4. Confirm known status options are generated from the lead registry.
5. Confirm `Все статусы` is present.
6. Confirm selecting a known status filters by its stored Russian label.
7. With an unknown raw fixture such as `Legacy Custom Status`, confirm the filter contains:

   `Неизвестный статус: Legacy Custom Status`

8. Confirm the option value remains exactly `Legacy Custom Status`.
9. Confirm re-rendering the lead list does not remove the selected unknown option.

## Lead list cards

1. For a `Новая` lead, confirm `В работу` is visible and enabled.
2. For `В работе`, confirm the duplicate `В работу` action is hidden.
3. For terminal statuses such as `Создан заказ`, `Отказ` or `Спам`, confirm `В работу` is hidden.
4. For an unknown raw status, confirm:
   - the raw value remains visible;
   - the status chip receives an unknown-state warning;
   - an inline badge shows `Неизвестный статус: ...`;
   - `В работу` is unavailable.
5. Confirm no status is rewritten merely by rendering the list.

## Lead card quick transitions

1. Open a lead in status `Новая`.
2. Confirm the current status is shown as a disabled active chip.
3. Confirm only registry-allowed targets are displayed:
   - `В работе`;
   - `Уточнение деталей`;
   - `Отказ`;
   - `Спам`.
4. Confirm `Создан заказ`, `КП отправлено` and other non-adjacent statuses are not offered.
5. Open a terminal lead such as `Создан заказ`.
6. Confirm no transition buttons are available and the card explains that reopening is not described by the current registry.
7. Open an unknown raw fixture.
8. Confirm the raw status is displayed without normalization and all status transitions are blocked.

## Capture-phase guards

1. In DevTools, temporarily create or invoke a disallowed status button such as `Новая → Создан заказ`.
2. Confirm the click is stopped before the legacy delegated handler performs an UPDATE.
3. Confirm the UI shows:

   `Переход «Новая → Создан заказ» не разрешён registry.`

4. For a new lead, click a next-contact shortcut before moving the lead to `В работе`.
5. Confirm the UI blocks the legacy implicit `Новая → Ждём ответ` transition and asks to move the lead to work first.
6. Move the lead to `В работе`, then save the next contact and confirm it succeeds without changing the status unexpectedly.

## Network checks

The new registry UI modules must not perform their own Supabase reads or writes.

Confirm that loading, filtering and decorating statuses emits no additional:

- INSERT;
- UPDATE;
- DELETE;
- UPSERT;
- RPC;
- Edge Function call.

A permitted user action can still be handled by the existing lead module, but only after the capture-phase registry guard allows it.

## Unknown raw status safety

For an unknown value:

- do not replace it with `Новая`;
- do not silently select the first known status;
- do not archive it automatically;
- do not make a write request;
- show the exact raw value;
- require an explicit future mapping in `status-transitions-v1.js` before transitions are enabled.

## Pass criteria

- filter options are registry-backed;
- unknown raw options survive re-rendering;
- list and card actions expose only allowed transitions;
- terminal statuses cannot return to work;
- unknown statuses cannot transition;
- hidden legacy `Новая → Ждём ответ` is blocked;
- no new Supabase write path exists in the adapter;
- raw production status rows are unchanged;
- no Supabase DDL/DML, Edge deploy, RLS, grants, Auth or Storage change is required;
- `nav_*`, `nav-*`, `parket-*` and `broker-*` are untouched.
