# CRM v4: ручная проверка акта выполненных работ

Related: #200, #202, #204, #214, #215.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=orders`

## Scope

This checklist validates the source-only order act preview and company requisites sidecar.

The feature must remain read-only:

- no document or company setting is saved;
- no final unique number is allocated;
- no order/payment/production/installation status changes;
- no POST, PATCH, INSERT, UPDATE or DELETE request;
- no contractor cost, profit, margin or internal comment in preview/print.

## Role scenarios

### owner / admin

1. Log in and open `Заказы`.
2. Open an order card and confirm `Создать акт` appears.
3. Open the act and confirm `Проверить реквизиты` appears.
4. Confirm the requisites form validates fields and updates its preview live.
5. Confirm valid values can be applied only to the current unsaved act draft.

### manager / accountant

1. Confirm `Создать акт` appears.
2. Confirm draft fields are editable and preview/print works.
3. Confirm `Проверить реквизиты` is absent because the form is only owner/admin.
4. Confirm there is no action that saves, signs or voids an act in stage 1.

### designer / installer / contractor

1. Confirm `Создать акт` is absent.
2. Try to trigger `[data-order-act-preview]` manually.
3. Confirm the action guard denies generation.
4. Confirm no order/client/item/settings request is sent by the act module.

## Data loading checks

Use browser Network tools.

Allowed requests:

- minimal SELECT fields from `leader_orders`, `leader_order_items` and `leader_clients`;
- one GET/SELECT for `leader_settings` key `company_legal_details_v1` when the act opens.

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

## Company settings checks

1. With no setting row, confirm editable safe defaults remain and no error blocks the act.
2. With a readable valid setting, confirm blank/default executor, tax and signatory fields are filled.
3. Edit an act field before a repeated observer pass and confirm automatic loading does not overwrite the edit.
4. As owner/admin click `Проверить реквизиты`.
5. Check invalid INN, email, account, correspondent account and BIK formats.
6. Confirm secret-like fields are not present in the form or preview.
7. Submit valid values and confirm the form applies values only to the current unsaved act draft.
8. Reopen the form and confirm no edited value was persisted to `leader_settings`.
9. In Network confirm no POST, PATCH, INSERT, UPDATE or DELETE occurs.

## Editor checks

1. Confirm title is `Черновик акта выполненных работ`.
2. Confirm the draft number contains `ЧЕРНОВИК`.
3. Confirm the warning states that the number is not final or guaranteed unique.
4. Confirm order number/project and client are prefilled.
5. Confirm executor requisites are editable whether they were auto-filled or left as fallback.
6. Confirm customer requisites and tax mode are editable.
7. Confirm completion and claims statements are editable.
8. Confirm each row has name, quantity, unit, price and client sum.
9. Add/remove a row and confirm total updates.
10. Change quantity/price/sum and confirm total updates.

## Warning scenarios

Verify warnings for order without client name, order without client-facing rows, unfinished order/production/installation, and mismatch between item sum and `client_total`.

Warnings must not automatically change source data.

## Print/PDF checks

1. Click `Предпросмотр / печать PDF`.
2. Confirm a new window opens and title contains `akt-vypolnennyh-rabot`.
3. Confirm A4 layout, document number/date/basis and party blocks.
4. Confirm only client-facing rows and amounts are visible.
5. Confirm total, tax text, statements and signature lines.
6. Confirm `Предварительный несохранённый черновик` is visible.
7. Print or save to PDF.
8. Confirm long rows do not clip and table header repeats on additional pages when supported.
9. Confirm popup blocking is handled with a clear error.

## No-write proof

During settings, editor and print operations confirm:

- no POST/PATCH/DELETE to Supabase REST;
- no Edge Function invocation;
- no new or changed row in any `leader_*` table;
- order/payment/production/installation status unchanged.

## Pass criteria

- allowed roles see and use the draft generator;
- restricted roles do not;
- only owner/admin can open the settings preview;
- only minimal client-facing fields and the keyed read-only setting are requested;
- preview contains no internal, cost or secret data;
- requisites fallback and autofill both work;
- PDF/print works and the number is visibly non-final;
- no CRM data is changed;
- no browser console error comes from the act or company settings modules.

## Failure evidence

Record browser and role, order ID/number without personal data, screenshot, Network method/table/fields, console error, popup state and any unexpected write.
