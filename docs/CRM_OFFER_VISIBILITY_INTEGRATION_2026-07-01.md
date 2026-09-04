# CRM offer visibility integration — 2026-07-01

Scope: CRM РА «Лидер», frontend only, no Supabase production changes.
Related issues: #143, #145.

## Status

Implemented in the unified calculation / commercial-offer flow.

`crm/v4/assets/v4/offers.js` now builds client-facing short and full commercial-offer text from `offer-visibility-v1.js` instead of exposing every raw calculation item with `client_sum > 0`.

Existing saved calculation items remain backward-compatible: when `data.visibility` is absent, the helper treats the item as `single_line`.

## Active behavior

Commercial offer text uses public rows only.

Visibility rules:

- `single_line`: show one final client-facing line;
- `detailed`: show only components marked `client_visible = true` and having a positive client sum;
- `internal_only`: do not show the item in the commercial offer.

Never show to the client:

- contractor cost;
- supplier price;
- internal cost;
- profit;
- margin;
- markup percentage.

`shortOfferItemNames()` and `publicOfferRows()` are both used by `offers.js`, so short and full offer variants use the same privacy rules.

## Composite calculation integration

The unified calculation workspace now has a `composite` mode for products made from several materials or works.

A composite product is persisted as one normal `leader_lead_calculation_items` row. Its internal composition is snapshotted inside `data.components`, so no new table or schema migration is required.

Supported client presentation:

- `single_line`: one parent product line; a manually entered parent total may be used, otherwise component totals or the common Calculation Workspace markup rule are used;
- `detailed`: only explicitly client-visible components are emitted into the offer; the parent calculation total equals the sum of those visible components;
- hidden components remain in the internal snapshot and never become public offer rows.

For detailed composite products, the parent client price is protected from ad-hoc editing after the item enters the draft. To change the detailed price split, the user edits/rebuilds the component composition so the calculation total and client-visible rows cannot silently diverge.

## Helper contract

`crm/v4/assets/v4/offer-visibility-v1.js` provides:

- `offerVisibilityVersion()`;
- `itemVisibility(item)`;
- `itemClientTitle(item)`;
- `publicOfferRows(items)`;
- `shortOfferItemNames(items, limit)`.

`crm/v4/assets/v4/calculation-composite-model-v1.js` provides the pure composite normalization, totals and validation used by the UI.

## Safety

No database schema migration is required.

The calculation builder stores extended metadata inside `leader_lead_calculation_items.data` and continues to use the existing calculation save/version routes.

Supabase production is not changed by this integration.

## Automated checks

Permanent CI covers:

1. old item without `data.visibility` still renders as one normal offer row;
2. `single_line` renders one client-facing row;
3. `internal_only` is hidden;
4. `detailed` emits only positive, explicitly client-visible components;
5. internal contractor cost, profit, margin and markup fields are absent from the client offer builder contract;
6. composite totals and component visibility are covered by pure unit tests;
7. the composite form must actually exist inside `renderModeFields`, not only in calculation logic.
