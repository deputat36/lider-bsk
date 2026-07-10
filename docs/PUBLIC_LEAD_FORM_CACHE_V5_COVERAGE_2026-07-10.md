# Public lead form cache v5 coverage — 2026-07-10

Related: #142, #185, #191, #195.

## Completed coverage

`tools/check_public_lead_form_cache_v5_partial.py` now protects 17 public pages that already load:

`assets/public-lead-form.js?v=5`

The checker requires for every covered page:

- the page file exists;
- the v5 script reference appears exactly once;
- no stale `assets/public-lead-form.js?v=4` reference remains;
- the shared public lead form script is connected exactly once.

Covered groups:

- main services and banner pages;
- outdoor advertising and shop-opening pages;
- the polygraphy hub;
- all ten polygraphy service pages;
- VK advertising posts;
- Yandex Maps / 2GIS audit page.

## Intentionally not migrated by this change

Large inline-CSS pages tracked in #191 and #195 remain unchanged until they can be shortened through a safe working-copy or patch workflow. This includes `pechat-bannerov-borisoglebsk.html` and other pages still intentionally using v4.

`index.html` and `request.html` also remain unchanged in this step because their cache versions are protected by separate contracts and require coordinated updates.

## Production boundary

No public form logic, endpoint, request payload or `request_id` behavior changed.

No Supabase DDL, DML, Edge Function, RLS, grants, Auth or data changed.

No CRM or `nav_*` file was modified.
