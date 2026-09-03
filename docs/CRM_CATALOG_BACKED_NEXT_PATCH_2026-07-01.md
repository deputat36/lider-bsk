# CRM catalog-backed next patch — 2026-07-01

Scope: CRM РА «Лидер», calculation builder v2.
Related issues: #148, #149, #154, #156.
Status updated: 2026-09-03.

## Implemented state

Catalog-backed calculation is now split into one source layer and one shared calculation workspace.

Implemented:

- active `leader_catalog` rows are loaded through `calculation-catalog-source-v1.js`;
- exact staging deliberately uses the local fallback because its compatibility schema has no `leader_catalog` table;
- hardcoded `CATALOG` remains only as emergency fallback;
- `calcItem(raw, index)` preserves `catalog_id`;
- the explicit «Из каталога» mode persists `catalog_id` and immutable pricing snapshot;
- ordinary banner, film, sheet/PVC and photo modes now resolve their reusable materials/services from the loaded catalog first;
- ordinary catalog-backed rows also persist `catalog_id` and pricing snapshot;
- manager-entered cost overrides for auxiliary material/service rows are recorded without losing the catalog reference;
- client pricing for ordinary typical modes still uses the common Calculation Workspace markup controls;
- catalog reference client price is retained in the snapshot for audit/comparison;
- the existing calculation save flow remains unchanged.

## Typical mode mapping

The following calculation modes now receive catalog metadata when a reusable catalog row exists:

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

`CATALOG` is not removed because it protects staging and temporary catalog-read failures. Active lookup/options no longer read that literal directly; they use normalized loaded rows and fall back by name only when required.

## Safety

No database schema, RLS policy, Auth configuration or Edge Function change is required.

Production and staging Supabase remain unchanged by this source patch.
