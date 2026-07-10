# CRM v4 role tab matrix manual test — 2026-07-10

Related: #200, #202.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/`

## Scope

This test validates UI visibility, router fallback and production sub-section data minimization.

It does not prove server-side authorization. Full RLS/RPC/Edge enforcement remains tracked in #202.

## Expected CRM v4 tabs

### owner / admin

- Дашборд;
- Заявки;
- Заказы;
- Контроль заказов;
- Финансы;
- Производство;
- Контроль контактов;
- Аудит заявок;
- Доступ и роли.

Inside `Производство`, owner/admin can open both production and installation jobs and may see cost/internal data.

### manager

- Заявки;
- Заказы;
- Контроль заказов;
- Производство;
- Контроль контактов;
- Аудит заявок.

Manager must not see:

- Дашборд, because it currently includes cost/profit/margin;
- Финансы;
- Доступ и роли;
- cost fields inside production/installation cards.

Manager can open both production and installation sub-sections and may see internal operational notes.

### accountant

- Заказы;
- Контроль заказов;
- Финансы.

Accountant does not receive the production section from the current conservative UI map.

### designer

- Производство tab;
- only the `Производство` sub-section;
- no installation jobs;
- no costs, internal notes or order-opening action.

### contractor

- Производство tab;
- only the `Производство` sub-section;
- no installation jobs;
- no costs, internal notes or order-opening action.

### installer

- Производство tab;
- only the `Монтаж` sub-section;
- no production jobs;
- no costs, internal notes or order-opening action.

## Manual scenarios

1. Log in with each available role.
2. Confirm only the expected tab buttons are visible and enabled.
3. Add an unauthorized `?tab=` value to the CRM URL.
4. Confirm the router does not open the unauthorized section.
5. Confirm CRM falls back to the first allowed tab.
6. Confirm hidden buttons are marked `hidden`, `disabled` and `aria-hidden=true`.
7. Confirm lead-card routing remains available for roles that can access `leads`.
8. Confirm production-only roles cannot open finance/user-admin through a direct tab URL.
9. Confirm a restricted `[data-open-order]` action is denied by the capture-phase router.
10. Inside production, confirm each role sees only its allowed job type.
11. Use Network tools to confirm restricted roles do not request cost/internal fields.
12. Confirm production/installation print sheets omit client contacts, costs and internal notes.
13. Confirm unknown or unsupported roles receive no working tab until the role is corrected.
14. Confirm no browser console errors are introduced by the role helper, router, menu, production board or job cards.

## Expected source mapping

- owner/admin: full CRM v4 tabs, both production kinds, costs and internal notes;
- manager: lead/order/production/contact operations, both production kinds, internal notes, no costs;
- accountant: order and finance operations;
- designer/contractor: production jobs only, no costs/internal notes;
- installer: installation jobs only, no costs/internal notes.

## Pass criteria

- UI tabs match the conservative v4 role map;
- production sub-sections match the role map;
- direct unauthorized tab and action navigation is denied;
- restricted SELECT lists omit cost/internal fields;
- active-profile loading still completes;
- the current allowed tab remains highlighted;
- no role receives more UI data or actions than documented;
- the UI clearly remains defense-in-depth, not the server-side authorization source of truth.

## Detailed production checklist

Use:

`docs/CRM_V4_PRODUCTION_ROLE_DATA_MINIMIZATION_MANUAL_TEST_2026-07-10.md`.

## Production boundary

This source change does not alter RLS, grants, policies, Auth, database data or Edge Functions.
