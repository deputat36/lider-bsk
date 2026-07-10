# CRM v4: ручная проверка акта выполненных работ

Related: #200, #202, #204, #214.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=orders`

## Scope

This checklist validates the source-only order act preview.

The feature must remain read-only:

- no document is saved;
- no final unique number is allocated;
- no order/payment/production/installation status changes;
- no INSERT, UPDATE or DELETE request;
- no contractor cost, profit, margin or internal comment in preview/print.

## Role scenarios

### owner / admin

1. Log in.
2. Open `Заказы`.
3. Open an order card.
4. Confirm `Создать акт` appears.
5. Confirm editor and print preview open.

### manager

1. Confirm `Создать акт` appears.
2. Confirm draft fields are editable.
3. Confirm preview/print works.
4. Confirm there is no action that marks the act as signed or voided in stage 1.

### accountant

1. Confirm `Создать акт` appears.
2. Confirm preview/print works.
3. Confirm order client-facing values are available.

### designer / installer / contractor

1. Confirm `Создать акт` is absent.
2. Try to trigger `[data-order-act-preview]` manually.
3. Confirm the action guard denies generation.
4. Confirm no order/client/item request is sent by the act module.

## Data loading checks

Use browser Network tools.

Allowed SELECT fields:

- `leader_orders`: ID, order number, project/status/deadline, client name/phone/total, payment/layout/production/installation statuses, client link, dates and public comment;
- `leader_order_items`: ID, order link, name, unit, quantity, client sum and created date;
- `leader_clients`: ID, name, phone and address.

The module must not request:

- `contractor_cost`;
- `contractor_price`;
- `contractor_sum`;
- `profit`;
- `margin`;
- `internal_comment`;
- full order `data` JSON;
- staff email;
- payment or expense amounts.

## Editor checks

1. Confirm title is `Черновик акта выполненных работ`.
2. Confirm the draft number contains `ЧЕРНОВИК`.
3. Confirm the warning states that the number is not final or guaranteed unique.
4. Confirm order number/project and client are prefilled.
5. Confirm executor requisites remain editable because legal settings are not configured.
6. Confirm customer requisites are editable.
7. Confirm tax mode is editable.
8. Confirm completion and claims statements are editable.
9. Confirm each row has name, quantity, unit, price and client sum.
10. Add a row and confirm total updates.
11. Remove a row and confirm total updates.
12. Change quantity/price/sum and confirm total updates.

## Warning scenarios

Verify warnings for:

- order without client name;
- order without client-facing rows;
- unfinished order;
- unfinished production;
- unfinished installation;
- mismatch between item sum and `client_total`.

Warnings must not automatically change source data.

## Print/PDF checks

1. Click `Предпросмотр / печать PDF`.
2. Confirm a new window opens.
3. Confirm document title contains `akt-vypolnennyh-rabot`.
4. Confirm A4 layout.
5. Confirm document number/date/basis.
6. Confirm executor and customer blocks.
7. Confirm only client-facing rows and amounts.
8. Confirm total.
9. Confirm tax text.
10. Confirm completion and no-claims statements.
11. Confirm signature lines.
12. Confirm visible text `Предварительный несохранённый черновик`.
13. Print or save to PDF.
14. Confirm long rows do not clip.
15. Confirm table header repeats on additional pages when supported by the browser.

## No-write proof

During editor and print operations confirm:

- no POST/PATCH/DELETE to Supabase REST;
- no Edge Function invocation;
- no new row in any `leader_*` table;
- order status unchanged;
- payment status unchanged;
- production status unchanged;
- installation status unchanged.

## Pass criteria

- allowed roles see and use the draft generator;
- restricted roles do not;
- only minimal client-facing fields are requested;
- preview contains no internal or cost data;
- the draft is editable;
- PDF/print works;
- the number is visibly non-final;
- no CRM data is changed;
- popup blocking is handled with a clear error;
- no browser console error comes from `order-act-preview-v1.js`.

## Failure evidence

Record:

- browser and role;
- order ID/number without personal data in the issue comment;
- screenshot of editor or print layout;
- Network request method/table/fields;
- console error;
- whether popup was blocked;
- whether any unexpected write occurred.
