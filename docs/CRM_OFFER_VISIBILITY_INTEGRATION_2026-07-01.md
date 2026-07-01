# CRM offer visibility integration — 2026-07-01

Scope: CRM РА «Лидер», frontend only, no Supabase production changes.
Related issues: #143, #145.

## Current state

`crm/v4/assets/v4/offers.js` currently builds commercial offers from all calculation items with `client_sum > 0`.

This is safe enough for old calculations because internal cost fields are not inserted into the client text. However, it does not yet support the new builder visibility modes.

Existing saved calculation items are backward-compatible: current production data does not use `data.visibility` or `data.builder_version` yet.

## Target behavior

Commercial offer text must use public rows instead of raw calculation items.

Visibility rules:

- `single_line`: show one final client-facing line.
- `detailed`: show only components marked public/client-visible.
- `internal_only`: do not show the item in the commercial offer.

Never show to the client:

- contractor cost;
- supplier price;
- internal cost;
- profit;
- margin.

## Existing helper

`crm/v4/assets/v4/offer-visibility-v1.js` already provides:

- `offerVisibilityVersion()`;
- `itemVisibility(item)`;
- `itemClientTitle(item)`;
- `publicOfferRows(items)`;
- `shortOfferItemNames(items, limit)`.

## Required integration in offers.js

Add import near existing imports:

```js
import { publicOfferRows, shortOfferItemNames, offerVisibilityVersion } from './offer-visibility-v1.js';
```

Replace `publicItems(items)` with a wrapper:

```js
function publicItems(items) {
  return publicOfferRows(items);
}
```

In `buildOfferTexts`:

- use `const visibleItems = publicItems(items);`
- use `const shortNames = shortOfferItemNames(items, 8);`
- short offer list should use `shortNames`;
- full offer list should use `visibleItems`;
- when row price is missing or zero, do not show a zero price for detailed component rows.

In `renderCreateForm`, mention the active offer visibility helper version so the UI self-documents which rules are active.

## Why not change Supabase now

No schema migration is required for this step.

The new calculation builder can store extended metadata inside `leader_lead_calculation_items.data`.

## Read-only Supabase findings

RLS policies for these tables allow authenticated users with `leader_private.leader_has_access()`:

- `leader_lead_calculations`;
- `leader_lead_calculation_items`;
- `leader_commercial_offers`.

Therefore the current frontend direct-write approach can be preserved for the first implementation, but server-side Edge Function conversion remains the safer long-term option.

## Manual test after integration

1. Old calculation without `data.visibility` still creates a normal commercial offer.
2. Item with `data.visibility = single_line` appears as one line.
3. Item with `data.visibility = internal_only` is hidden.
4. Item with `data.visibility = detailed` shows only public components.
5. Contractor cost, profit and margin never appear in short or full offer text.
