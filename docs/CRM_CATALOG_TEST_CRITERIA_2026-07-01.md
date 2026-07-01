# CRM catalog test criteria — 2026-07-01

Catalog-backed mode is ready when:

- saved calculation item keeps `catalog_id`;
- saved item data keeps `calc-builder-v2`;
- saved item data keeps `mode = catalog`;
- saved item data keeps `visibility = single_line`;
- saved item data keeps `catalog_snapshot`;
- legacy manual items still save with empty `catalog_id`;
- commercial offer hides contractor price, internal cost, profit and margin;
- old saved calculation does not change after catalog price update.

Related issues: #148, #149, #154, #156, #160.

Supabase production schema should not change for this step.
