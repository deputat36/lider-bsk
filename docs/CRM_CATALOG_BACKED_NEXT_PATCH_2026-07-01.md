# CRM catalog-backed next patch — 2026-07-01

Scope: CRM РА «Лидер», calculation builder v2.
Related issues: #148, #149, #154, #156.

## Current facts

- `leader_catalog` has rows and the required pricing fields.
- `leader_lead_calculation_items` has `catalog_id`.
- Existing saved calculation items currently do not use `catalog_id`.
- `catalog-pricing-v1.js` can prepare catalog draft items.
- `saveCalculation()` can keep the existing save flow.

## Minimal code patch

In `crm/v4/assets/v4/calculations.js`:

1. Import `catalogDraftItem` and/or `catalogClientUnitPrice` from `catalog-pricing-v1.js`.
2. Preserve `raw.catalog_id` inside `calcItem(raw, index)`.
3. Extend `makeRawItem()` to accept optional `catalogId`.
4. Load active `leader_catalog` rows before rendering calculation options.
5. Use hardcoded `CATALOG` only as fallback.
6. Use catalog pricing rules instead of `material.price` when row comes from `leader_catalog`.

## Safety

The patch should not change database schema or Edge Functions.

Legacy manual items can keep `catalog_id = null`.
