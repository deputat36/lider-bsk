# CRM catalog pricing rules — 2026-07-01

Scope: CRM РА «Лидер», calculation builder v2.
Related issues: #143, #148, #149, #151, #152.

## Source table

Use `leader_catalog` as the source for reusable calculation positions.

Important fields:

- `id`;
- `category`;
- `name`;
- `unit`;
- `item_type`;
- `contractor_price`;
- `markup_percent`;
- `min_client_price`;
- `default_client_price`;
- `calculation_mode`;
- `settings`;
- `is_active`;
- `sort_order`.

## Pricing rule

For the first implementation:

1. If `default_client_price` is filled, use it as client unit price.
2. Otherwise calculate client unit price from `contractor_price` and `markup_percent`.
3. If result is lower than `min_client_price`, use `min_client_price`.
4. Quantity multiplies both contractor and client unit prices.

## Saving rule

When a catalog item is added to a saved calculation:

- save catalog id into `leader_lead_calculation_items.catalog_id`;
- save category, type, name, unit and prices into normal item columns;
- save catalog snapshot into item `data`;
- default client visibility is `single_line`.

## Snapshot rule

Saved calculations must not change when catalog prices are edited later.

The saved item should keep the old catalog data in `data.catalog_snapshot`.

## Access rule

Catalog editing must be restricted by role.

Use `leader_role_permissions.can_edit_catalog` or an equivalent server-side role check before enabling catalog editing.

## Production rule

No Supabase production schema change is required for the first catalog-backed mode.
