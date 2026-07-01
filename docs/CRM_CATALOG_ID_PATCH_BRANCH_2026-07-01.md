# CRM catalog id patch branch — 2026-07-01

Branch: crm-catalog-id-patch.

Purpose: finish Issue #156 safely.

Apply locally:

1. Run tools/patch_calculations_catalog_id.py.
2. Run tools/check_calculations_catalog_id.py.
3. Run tools/check_patch_calculations_catalog_id.py.

Expected result:

calcItem(raw, index) in crm/v4/assets/v4/calculations.js preserves raw.catalog_id.

Safety:

- no Supabase schema change;
- no Edge Function deploy;
- legacy and manual items may keep catalog_id empty;
- patch is one targeted replacement.

Related issues: #148, #149, #154, #156.
