# CRM v4 production role data minimization manual test — 2026-07-10

Related: #200, #202.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=production`

## Scope

This checklist validates browser-side role separation and data minimization inside the shared `Производство` section.

It is defense-in-depth only. Server-side RLS/RPC/Edge authorization remains tracked in #202.

## Expected sub-sections

### owner / admin / manager

- `Производство`;
- `Монтаж`.

### designer / contractor

- only `Производство`;
- no installation query, tab, cards or installation modal.

### installer

- only `Монтаж`;
- no production query, tab, cards or production modal.

### accountant

- no production section.

## Cost visibility

Costs are visible only to:

- owner;
- admin;
- accountant, when using sections available to that role.

Manager, designer, installer and contractor must not receive or display:

- `contractor_cost`;
- `contractor_price`;
- `installer_cost`;
- `installer_price`.

Use browser Network tools to confirm restricted-role SELECT field lists do not contain these columns.

## Internal-data visibility

Internal notes are visible only to:

- owner;
- admin;
- manager.

Designer, installer and contractor must not receive or display:

- `internal_comment`;
- order `data` JSON;
- staff email in production events;
- installation comments where `comment_type=internal`.

## Navigation checks

1. Log in with each available role.
2. Open the `Производство` section.
3. Confirm only allowed sub-section buttons are rendered.
4. Attempt to trigger the other kind through the DOM or a synthetic click.
5. Confirm the board falls back to the first allowed kind or denies the action.
6. Confirm `Открыть заказ` is absent for roles without `orders`.
7. Confirm the capture-phase router denies a manually injected `[data-open-order]` button.
8. Confirm production and installation card open/save/print handlers reject a disallowed kind.

## Production card checks

For designer/contractor:

- production card opens;
- cost summary is absent;
- item cost is absent;
- internal comment input is absent;
- event author email is absent;
- print sheet contains no client contacts or costs.

For installer:

- production card does not open.

## Installation card checks

For installer:

- installation card opens;
- payment/cost summary is absent;
- item installer price is absent;
- internal comments are hidden;
- adding internal comments is unavailable;
- print sheet contains no client contacts or costs.

For designer/contractor:

- installation card does not open.

## Pass criteria

- each role requests only its allowed job type;
- restricted SELECT lists omit cost and internal fields;
- hidden sub-sections cannot be reopened through UI events;
- restricted roles cannot open orders from job cards;
- printed production/installation sheets contain no client contacts, costs or internal notes;
- no browser console errors are introduced;
- production source changes do not alter Supabase data, RLS, grants, policies or Edge Functions.
