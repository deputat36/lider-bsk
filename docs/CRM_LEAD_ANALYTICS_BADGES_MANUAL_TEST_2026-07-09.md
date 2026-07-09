# CRM lead analytics badges manual test — 2026-07-09

Scope: RA Lider CRM v4 lead list.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

Related issues: #196, #197, #198.

## What was implemented

GitHub source now contains a derived analytics UI layer for lead cards:

- `crm/v4/assets/v4/lead-analytics-normalization.js` derives normalized service/source categories.
- `crm/v4/assets/v4/lead-analytics-badges-v1.js` adds visual badges to rendered lead cards.
- `crm/v4/index.html` loads `assets/v4/lead-analytics-badges-v1.js?v=20260709-1` after `leads.js`.

The implementation does not change Supabase data and does not rewrite raw `leader_leads.service` or `leader_leads.source` values.

## Manual test checklist

1. Open `https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`.
2. Log in as an allowed CRM user.
3. Wait until the lead list is loaded.
4. Confirm that lead cards still show the original raw source and service in the metadata line.
5. Confirm that each lead card also shows derived badges:
   - `Услуга: ...`;
   - `Источник: ...`.
6. Click `Обновить заявки`.
7. Confirm that the badges appear again after the list refreshes.
8. Switch away from the leads tab and back to `Заявки`.
9. Confirm that the badges still appear and are not duplicated multiple times on the same card.
10. Open a lead card and return to the list.
11. Confirm that the lead list still works and no browser console errors appear from `lead-analytics-badges-v1.js`.

## Expected examples

The exact category depends on the raw lead values:

- raw service containing `баннер` should show `Услуга: Баннеры`;
- raw service containing `наклейк` should show `Услуга: Наклейки`;
- raw service containing `табличк` should show `Услуга: Таблички`;
- raw source/page URL related to the site should show `Источник: Сайт`;
- raw source `VK` or `ВКонтакте` should show `Источник: ВКонтакте`.

## Pass criteria

The test is passed if:

- lead cards load normally;
- badges appear on cards;
- badges are not duplicated after refresh/re-render;
- raw source/service values remain visible;
- no data changes are made in Supabase;
- no browser console errors appear from the analytics badges module.

## If the test fails

Keep #198 open and record:

- browser;
- account/role used for test;
- screenshot of the card;
- console error text if any;
- whether the list loaded before the badges failed.
