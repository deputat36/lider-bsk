# CRM calculation builder v2 — 2026-07-01

Repository: `deputat36/lider-bsk`.
Scope: CRM РА «Лидер», only `leader_*` tables.
Tracking issue: #143.
Status updated: 2026-09-03.

## Current implementation status

The calculation workspace is now centered on one active builder: `crm/v4/assets/v4/calculations.js`.

Implemented:

- unified calculation UI for typical and non-standard positions;
- common markup controls and margin/profit preview;
- catalog-backed mode using `leader_catalog` in production with safe staging fallback;
- real `catalog_id` and catalog pricing snapshot persistence;
- contractor quote mode inside the same builder;
- contractor/base cost, delivery, installation, design and other internal costs;
- manual client total override when required;
- shared automatic markup rules when the client total is not entered manually;
- `single_line` client visibility for catalog and contractor items;
- saved calculation review and version/revision workflow;
- commercial offer visibility helper and offer rules;
- need-to-calculation prefill;
- browser and static regression contracts.

The old visible `calculation-contractor-quote-v1.js` shell is retired from the lead-card bundle because it duplicated the calculation interface and did not persist data.

Issue #148 (catalog-backed mode) is completed. Issue #144 is implemented by the unified contractor mode and existing calculation persistence path.

Supabase production schema has not been changed for these improvements.

## Goal

Replace scattered calculation modules with one clear calculation builder for daily agency work.

The target is one builder with several modes, not several equal calculators.

## Main principle

A calculation consists of client-facing positions.

Each client-facing position may have internal cost components.

By default, a commercial offer shows one final client-facing line. The manager may enable a detailed public breakdown when needed.

Internal costs, supplier prices, profit and margin must not be shown to the client by default.

## Active modes

The current unified UI includes practical modes for:

- `catalog` — position from `leader_catalog`;
- `contractor_quote` — supplier/contractor quote plus delivery, design, installation and other costs;
- banner;
- film / stickers;
- sheet / PVC material;
- PVC shapes;
- letters / digits;
- photo printing;
- service / design / installation / delivery;
- manual custom position.

The architecture still maps these to the original builder concepts: standard, catalog, contractor quote, manual and composite calculations.

## Client visibility

Items support the established visibility model:

- `single_line` — show only final title and amount;
- `detailed` — show selected public components;
- `internal_only` — hide from the commercial offer.

Default visibility for contractor and catalog-backed positions: `single_line`.

## Tables

The implementation uses the existing structure:

- `leader_lead_calculations`;
- `leader_lead_calculation_items`;
- `leader_catalog`;
- existing related calculation/order tables.

Extended builder data remains in `leader_lead_calculation_items.data` JSONB, so no schema migration is needed for contractor cost components or catalog snapshots.

## Pricing rules

There is one common pricing control for the calculation workspace.

- automatic markup can use small/medium/large order tiers;
- the manager can set one explicit markup percentage;
- the manager can enter a client price manually for an individual position;
- catalog positions retain their catalog pricing source until manually overridden;
- contractor quote positions use the same common markup controls instead of a second markup field;
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

## Commercial offer rules

The offer generator must continue to:

- never show `contractor_price`, `contractor_sum`, profit or margin;
- show client totals only;
- show one line by default;
- show detailed public components only when explicitly enabled;
- keep internal components hidden.

## Regression protection

CI checks must protect all of the following:

- unified pricing model;
- contractor quote model and snapshot;
- catalog-backed source and pricing behavior;
- need-to-calculation flow;
- saved calculation review;
- lead-card lazy-loader module order;
- absence of the obsolete contractor quote shell from executable loading paths;
- browser loading/navigation behavior.

## Manual test scenarios

1. Banner with grommets and edge finishing.
2. PVC sign with film, print, application and cutting.
3. Contractor sign quote with delivery, installation and common markup.
4. Contractor quote with manually entered client total.
5. Manual design work as a separate position.
6. Catalog item with catalog snapshot and manual client-price override.
7. Composite item shown as one line in commercial offer.
8. Low-margin warning.
9. Order creation from approved commercial offer.

## Remaining UX direction

Further work should improve the same workspace rather than create new calculators. Priority areas include clearer direct control of target margin/client price and continued removal of obsolete parallel calculation code where tests confirm it is safe.

## Production rule

Do not change Supabase production schema or deploy Edge Functions without explicit owner approval.
