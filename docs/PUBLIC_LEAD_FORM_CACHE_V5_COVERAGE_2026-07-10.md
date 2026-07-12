# Public lead form cache coverage — completed 2026-07-12

Related: #142, #185, #191, #195, PR #244.

## Two complementary contracts

The repository now uses two different checks intentionally.

### Fixed v5 subset

`tools/check_public_lead_form_cache_v5_partial.py` protects the coordinated group of pages whose SEO contract explicitly expects:

`assets/public-lead-form.js?v=5`

For every listed page the checker requires:

- the file exists;
- the v5 script reference appears exactly once;
- no stale v4 reference remains;
- the shared form script is connected exactly once.

This fixed subset includes the homepage, request page, main services, contacts, banner and outdoor pages, polygraphy pages, VK post service and maps audit page.

### Complete all-pages contract

`tools/check_all_public_form_cache_versions.py` scans every root public HTML file instead of relying on a maintained list.

For every page that connects `assets/public-lead-form.js`, it requires:

- exactly one script connection;
- an explicit numeric query version;
- minimum version `v=5`.

It permits newer cache markers such as `v=6`, `v=9`, `v=10`, `v=11` and `v=14`. These newer versions must not be downgraded merely to make every page use the same number.

Workflow:

- `.github/workflows/public-form-complete-contract-check.yml`.

The same complete checker is also called from the public section of `Static checks`.

## Final audit result

PR #244 found 49 root public pages using the shared form.

Final result:

- 49 pages validated;
- four genuine v4 references updated to v5;
- no unversioned form script connections;
- no duplicate form script connections;
- all remaining versions are numeric and `v≥5`.

The four corrected pages were:

- `nakleyki-plotternaya-rezka-borisoglebsk.html`;
- `socseti-kontent.html`;
- `tablichki-borisoglebsk.html`;
- `yandex-karty-2gis.html`.

## Large-page migrations completed

The former inline-CSS blockers are no longer pending:

- `index.html` now uses `assets/public-homepage.css`;
- `request.html` now uses `assets/public-request.css`;
- the five tracked outdoor landing pages use the shared landing foundation and page-specific CSS contracts.

The request page still loads its retry/reference helper before the shared form script.

## CI result

The final PR passed:

- complete form contract;
- request CSS/v5 contract;
- request reference and SEO checks;
- public site audit;
- `Static checks`;
- canonical, Open Graph, retry and no-secret checks.

Merge commit:

- `07d5ba61fc28fb09514b54d89eff8b2c8602e033`.

## Production boundary

No form endpoint, request payload or `request_id` behavior was intentionally changed by the cache-version normalization.

No Supabase DDL, DML, Edge Function, RLS, grants, Auth or data change was made.

No CRM UI or `nav_*` file was modified.

## Next public-site dependencies

- #235 — real approved portfolio materials;
- #236 — confirmed NAP/contact information;
- a documented browser end-to-end test on the published domain.
