# CRM calculation builder v2 — 2026-07-01

Repository: `deputat36/lider-bsk`.
Scope: CRM РА «Лидер», only `leader_*` tables.
Tracking issue: #143.
Status updated: 2026-09-04.

## Current implementation status

The calculation workspace is centered on one active builder: `crm/v4/assets/v4/calculations.js`.

Implemented:

- unified calculation UI for typical and non-standard positions;
- common markup controls and margin/profit preview;
- catalog-backed mode using `leader_catalog` in production with safe staging fallback;
- real `catalog_id` and immutable catalog pricing snapshot persistence;
- owner/admin creation of reusable `leader_catalog` nomenclature directly inside the calculation workspace, protected by existing `catalog.manage` UI access and production RLS;
- contractor quote mode inside the same builder;
- contractor/base cost, delivery, installation, design and other internal costs;
- composite-product mode with an arbitrary number of material/work components stored inside the item snapshot;
- one-line or detailed client presentation for composite products;
- manual client total override when required;
- shared automatic markup rules when the client total is not entered manually;
- `single_line`, `detailed` and `internal_only` commercial-offer visibility through the active `offer-visibility-v1.js` projection used by `offers.js`;
- saved calculation review and version/revision workflow;
- need-to-calculation prefill;
- browser, privacy, calculation and static regression contracts.

The old visible `calculation-contractor-quote-v1.js` shell is retired from the lead-card bundle because it duplicated the calculation interface and did not persist data.

Issue #148 (catalog-backed mode), issue #144 (contractor persistence), issue #149/#154 (catalog-backed typical modes), and the calculation-side catalog creation acceptance are completed. Issue #145 is implemented by the active commercial-offer visibility projection.

Supabase production schema has not been changed for these improvements.

## Goal

Replace scattered calculation modules with one clear calculation builder for daily agency work.

The implementation uses one builder with several modes, not several equal calculators.

## Main principle

A calculation consists of client-facing positions.

Each client-facing position may have internal cost components.

By default, a commercial offer shows one final client-facing line. The manager may enable a detailed public breakdown when needed.

Internal costs, supplier prices, profit and margin must not be shown to the client by default.

## Active modes

The current unified UI includes practical modes for:

- `catalog` — position from `leader_catalog`;
- `contractor_quote` — supplier/contractor quote plus delivery, design, installation and other costs;
- `composite` — one client-facing product assembled from multiple internal material/work components;
- banner;
- film / stickers;
- sheet / PVC material;
- PVC shapes;
- letters / digits;
- photo printing;
- service / design / installation / delivery;
- manual custom position.

These modes cover the original builder concepts: standard, catalog, contractor quote, manual and composite calculations inside one workspace.

## Client visibility

Items support the active visibility model:

- `single_line` — show only final title and amount;
- `detailed` — show selected public components;
- `internal_only` — hide from the commercial offer.

Default visibility for contractor and catalog-backed positions: `single_line`.

`offers.js` uses `publicOfferRows()` and `shortOfferItemNames()` from `offer-visibility-v1.js`, so both short and full client text follow the same privacy projection. Existing historical rows without `data.visibility` remain backward-compatible and are treated as `single_line`.

For detailed composite items, only components with `client_visible = true` and positive client value are emitted to the client. Hidden components remain internal in `data.components`.

## Tables

The implementation uses the existing structure:

- `leader_lead_calculations`;
- `leader_lead_calculation_items`;
- `leader_catalog`;
- existing related calculation/order tables.

Extended builder data remains in `leader_lead_calculation_items.data` JSONB, so no schema migration is needed for contractor cost components, catalog snapshots or composite components.

## Pricing rules

There is one common pricing control for the calculation workspace.

- automatic markup can use small/medium/large order tiers;
- the manager can set one explicit markup percentage;
- the manager can enter a client price manually for an individual position;
- catalog positions retain their catalog pricing source until manually overridden;
- contractor quote positions use the same common markup controls instead of a second markup field;
- single-line composite positions can use an explicit parent total or the common automatic markup when no client total is supplied;
- detailed composite positions derive the parent client total from the client-visible component totals so the calculation total and КП breakdown cannot silently diverge;
- profit and margin are recalculated from cost and client amount;
- low margin and loss conditions remain visible as warnings.

Markup and margin are not interchangeable: markup is calculated against cost, while margin is calculated against client revenue.

## Contractor quote snapshot

`calculation-contractor-quote-model-v1.js` creates one calculation item with:

- `builder_version = calc-builder-v2`;
- `mode = contractor_quote`;
- `visibility = single_line`;
- contractor identity snapshot;
- base cost;
- delivery;
- installation;
- design;
- other expenses;
- total internal cost;
- component list;
- manual/automatic price source.

The common `calcItem()` then calculates contractor sum, client sum, markup, profit and margin for persistence.

## Composite snapshot

`calculation-composite-model-v1.js` creates one normal calculation item with:

- `builder_version = calc-builder-v2`;
- `mode = composite`;
- `calculation_mode = composite`;
- `visibility = single_line` or `detailed`;
- `client_title`;
- `components` with quantity, unit, internal cost, client price, comment and client-visibility flag;
- aggregate contractor and client totals.

The calculation therefore remains compatible with the existing item/version persistence contract while preserving enough internal structure for a detailed КП.

## Commercial offer rules

The offer generator:

- never shows `contractor_price`, `contractor_sum`, profit, margin or markup;
- shows client totals only;
- shows one line by default;
- shows detailed public components only when explicitly enabled;
- keeps `internal_only` items and hidden components out of the client text;
- uses the same public projection for short and full commercial-offer text.

## Regression protection

CI checks protect all of the following:

- unified pricing model;
- contractor quote model and snapshot;
- composite model, totals and validation;
- catalog-backed source and pricing behavior;
- catalog creation access/staging guard contract;
- commercial-offer visibility and privacy projection;
- need-to-calculation flow;
- saved calculation review;
- lead-card lazy-loader module order;
- absence of the obsolete contractor quote shell from executable loading paths;
- browser desktop/mobile loading and navigation behavior.

## Manual test scenarios

1. Banner with grommets and edge finishing.
2. PVC sign with film, print, application and cutting.
3. Contractor sign quote with delivery, installation and common markup.
4. Contractor quote with manually entered client total.
5. Manual design work as a separate position.
6. Catalog item with catalog snapshot and manual client-price override.
7. Create reusable nomenclature from the calculation as owner/admin and immediately use it in the same draft.
8. Composite product shown as one line in the commercial offer.
9. Composite product shown as selected detailed client components while an internal component remains hidden.
10. Low-margin warning.
11. Order creation from approved commercial offer.

## Remaining UX direction

Issue #143 acceptance is implemented. Further work should improve the same workspace rather than create new calculators. Useful future refinements include clearer direct control of target margin/client price, richer editing of an already-added composite item's components, and continued removal of obsolete parallel calculation code where regression tests confirm it is safe.

## Production rule

Do not change Supabase production schema or deploy Edge Functions without explicit owner approval.