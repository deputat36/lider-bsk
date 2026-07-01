# CRM catalog to calculation item mapping — 2026-07-01

Scope: CRM РА «Лидер», calculation builder v2.
Related issues: #143, #148, #149, #152, #154, #156.

## Purpose

This document defines how one `leader_catalog` row becomes one `leader_lead_calculation_items` row.

## Direct fields

- `leader_catalog.id` -> `leader_lead_calculation_items.catalog_id`
- `leader_catalog.category` -> `leader_lead_calculation_items.category`
- `leader_catalog.item_type` -> `leader_lead_calculation_items.item_type`
- `leader_catalog.name` -> `leader_lead_calculation_items.name`
- `leader_catalog.unit` -> `leader_lead_calculation_items.unit`
- `leader_catalog.contractor_price` -> `leader_lead_calculation_items.contractor_price`

## Calculated fields

- `qty` comes from manager input.
- `contractor_sum` equals `qty * contractor_price`.
- `client_price` comes from catalog pricing rules.
- `client_sum` equals `qty * client_price`.
- `profit` equals `client_sum - contractor_sum`.
- `markup_percent` is calculated from contractor sum and profit.
- `margin_percent` is calculated from client sum and profit.

## Data field

The item `data` field should store:

- builder version: `calc-builder-v2`;
- mode: `catalog`;
- visibility: `single_line`;
- catalog snapshot: old catalog values at the moment of saving.

## Payload requirement

`calculations.js` must preserve `catalog_id` when converting a raw draft item into the final payload.

If `raw.catalog_id` exists, `calcItem(raw, index)` should return it.

Legacy and manual items may keep `catalog_id = null`.

## Backward compatibility

Old saved calculations without catalog snapshot must still work.

Commercial offers must keep hiding contractor price, internal cost, profit and margin.

## Production rule

No Supabase production schema change is required for this mapping.
