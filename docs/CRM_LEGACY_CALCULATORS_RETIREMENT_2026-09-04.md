# CRM legacy calculators retirement — 2026-09-04

Repository: `deputat36/lider-bsk`.
Tracking issue: #150.

## Decision

CRM v4 uses one active calculation workspace: `crm/v4/assets/v4/calculations.js`.

The following parallel calculators are retired and removed from executable source:

- `crm/v4/assets/v4/calculations-standard.js`;
- `crm/v4/assets/v4/calculations-advanced.js`.

They are not kept as fallback modules because they duplicate pricing and persistence logic, contain independent direct Supabase writes and preserve outdated hardcoded cost defaults. Keeping dead writable copies increases the risk of accidental reactivation and inconsistent calculations.

## Scenario coverage in the unified builder

The active builder already covers the scenarios that existed in the retired modules:

- banner;
- film / stickers;
- sheet / PVC materials;
- PVC shapes;
- letters / digits;
- services;
- manual positions;
- catalog-backed positions;
- contractor quotes;
- composite products.

Pricing, markup, margin, warnings, catalog snapshots, calculation versions and commercial-offer visibility now live in the unified calculation path and its focused helper models.

## Persistence compatibility

Existing saved calculations are not changed or migrated. They continue to use:

- `leader_lead_calculations`;
- `leader_lead_calculation_items`.

Removing the unused browser modules does not delete or transform historical calculation rows.

## Regression guard

`tools/check_crm_unified_calculation.py` must fail if either retired file is recreated or reconnected.

The CRM backend-write inventory no longer classifies the retired modules because they no longer exist. `calculations.js` remains the active calculation write path tracked by the backend contract inventory.

## Supabase guardrail

This retirement is source-only.

- no production DDL;
- no production DML;
- no RLS/grant changes;
- no Auth changes;
- no Edge Function deploy;
- no staging schema changes.

Production Supabase remains unchanged.
