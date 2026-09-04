# CRM catalog-backed next patch — 2026-07-01

Scope: CRM РА «Лидер», calculation builder v2.
Related issues: #148, #149, #154, #156, #169.
Status updated: 2026-09-04.

## Implemented state

Catalog-backed calculation is now split into one source layer and one shared calculation workspace.

Implemented:

- active `leader_catalog` rows are loaded through `calculation-catalog-source-v1.js`;
- staging has a compatibility `leader_catalog` table with no copied production data, so the same remote catalog path can be exercised there;
- hardcoded `CATALOG` remains only as emergency fallback when the remote catalog is unavailable or empty;
- `calcItem(raw, index)` preserves `catalog_id`;
- `leader_lead_calculation_items.catalog_id` is backed by a staging FK to `leader_catalog(id)` for real persistence verification;
- the explicit «Из каталога» mode persists `catalog_id` and immutable pricing snapshot;
- ordinary banner, film, sheet/PVC and photo modes resolve their reusable materials/services from the loaded catalog first;
- ordinary catalog-backed rows also persist `catalog_id` and pricing snapshot;
- manager-entered cost overrides for auxiliary material/service rows are recorded without losing the catalog reference;
- client pricing for ordinary typical modes still uses the common Calculation Workspace markup controls;
- catalog reference client price is retained in the snapshot for audit/comparison;
- the existing calculation save flow remains unchanged.

## Staging compatibility for issue #169

The previous staging-only forced fallback was removed. Staging now contains only the schema needed to verify catalog-backed calculations:

- `public.leader_catalog` with the same calculation-facing fields as production;
- RLS enabled;
- authenticated users receive only `SELECT` access to the staging catalog;
- the select policy uses the existing staging `leader_private.leader_has_access()` check;
- catalog creation remains disabled in the staging UI;
- `leader_lead_calculation_items.catalog_id` has the same `ON DELETE SET NULL` foreign-key behavior as production;
- a transaction-scoped acceptance test inserts synthetic rows and finishes with `ROLLBACK`, so no fixture remains.

No production catalog rows are copied to staging.

## Typical mode mapping

The following calculation modes receive catalog metadata when a reusable catalog row exists:

- `banner`;
- `banner_hemming`;
- `banner_grommets`;
- `film`;
- `mount_film`;
- `sheet`;
- `sheet_print`;
- `photo`;
- `photo_lamination`.

Purely custom processing rows such as manual plotter cutting, lamination/cutting overrides and bespoke shapes may continue with `catalog_id = null` until a matching reusable catalog item exists.

## Pricing behavior

There are intentionally two related pricing concepts:

1. `leader_catalog` supplies reusable source data, contractor cost and reference catalog pricing.
2. The unified Calculation Workspace supplies the actual client price for typical modes through the common markup/manual-price controls.

This prevents catalog integration from reintroducing separate pricing controls or a second calculator.

The dedicated «Из каталога» mode keeps its catalog pricing source unless the manager explicitly changes the row price later.

## Fallback

`CATALOG` is not removed. It remains an emergency fallback for temporary catalog-read failures and for an empty catalog. Active lookup/options use normalized loaded rows and fall back by name only when required.

Staging no longer forces fallback just because it is staging; this is required so `catalog_id` persistence can be verified against a real staging catalog row.

## Safety

Production Supabase schema, RLS, Auth, Edge Functions and data remain unchanged.

The staging-only compatibility migration is guarded by `leader_staging.environment_guard` and targets only project `otulfnouybahfnsycxqn`.

The acceptance test is transaction-scoped and rolls back all synthetic rows.
