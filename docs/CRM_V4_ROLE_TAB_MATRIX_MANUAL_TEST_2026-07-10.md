# CRM v4 role tab matrix manual test — 2026-07-10

Related: #200, #202.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/`

## Scope

This test validates UI visibility and router fallback only.

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
- Доступ и роли.

### accountant

- Заказы;
- Контроль заказов;
- Финансы.

### designer / installer / contractor

- Производство.

## Manual scenarios

1. Log in with each available role.
2. Confirm only the expected tab buttons are visible and enabled.
3. Add an unauthorized `?tab=` value to the CRM URL.
4. Confirm the router does not open the unauthorized section.
5. Confirm CRM falls back to the first allowed tab.
6. Confirm hidden buttons are marked `hidden`, `disabled` and `aria-hidden=true`.
7. Confirm lead-card routing remains available for roles that can access `leads`.
8. Confirm production-only roles cannot open finance/user-admin through a direct tab URL.
9. Confirm unknown or unsupported roles receive no working tab until the role is corrected.
10. Confirm no browser console errors are introduced by the role helper, router or expanded menu.

## Expected source mapping

- owner/admin: full CRM v4 tabs;
- manager: lead/order/production/contact operations without financial dashboard;
- accountant: order and finance operations;
- designer/installer/contractor: production only.

## Pass criteria

- UI tabs match the conservative v4 role map;
- direct unauthorized tab navigation is denied;
- active-profile loading still completes;
- the current allowed tab remains highlighted;
- no role receives more UI tabs than documented;
- the UI clearly remains defense-in-depth, not the server-side authorization source of truth.

## Production boundary

This source change does not alter RLS, grants, policies, Auth, database data or Edge Functions.
