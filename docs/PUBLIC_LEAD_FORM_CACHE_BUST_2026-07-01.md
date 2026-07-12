# Public lead form cache bust — completed 2026-07-12

Scope: public site only.

Related issues: #142, #185, #191, #195.

## Final status

The migration is complete.

Issue #185 was closed after PR #244. Issue #191 and the first-page migration #195 are also closed.

The original blocker was a group of public pages that still loaded `assets/public-lead-form.js?v=4` and contained large inline CSS blocks that made connector-only replacement unsafe.

The pages were migrated one at a time. Their content, SEO, forms, structured data and local service presets were protected by page-specific contracts before merge.

## Completed CSS migrations

The tracked pages now use extracted or shared CSS:

- `pechat-bannerov-borisoglebsk.html`;
- `banner-dlya-magazina-borisoglebsk.html`;
- `oformlenie-vhoda-borisoglebsk.html`;
- `nakleyki-na-vitrinu-borisoglebsk.html`;
- `rezhim-raboty-tablichki-borisoglebsk.html`;
- `index.html` → `assets/public-homepage.css`;
- `request.html` → `assets/public-request.css`.

The request page preserves the critical script order:

1. `assets/public-lead-reference-v1.js?v=1`;
2. `assets/public-lead-form.js?v=5`.

This keeps stable `request_id` reuse for controlled retries.

## Complete cache-version audit

PR #244 audited every root public HTML file that connects the shared form.

Result:

- 49 public form pages were found;
- every page connects the shared form exactly once;
- every page uses a numeric cache version `v≥5`;
- four real stale `v=4` references were updated to `v=5`;
- newer versions such as `v=6`, `v=9`, `v=10`, `v=11` and `v=14` were preserved.

Permanent checker:

- `tools/check_all_public_form_cache_versions.py`.

Permanent workflow:

- `.github/workflows/public-form-complete-contract-check.yml`.

The old partial v5 checker remains useful for the fixed subset of pages whose coordinated SEO contract explicitly requires `v=5`.

## Final CI state

The completion PR passed:

- `Static checks`;
- `Public form complete contract check`;
- `Public request CSS and v5 check`;
- `Request reference check`;
- `Public request SEO check`;
- `Public site audit check`;
- v5 SEO, canonical, Open Graph, retry and no-secret checks.

Merge commit:

- `07d5ba61fc28fb09514b54d89eff8b2c8602e033`.

## Production boundary

No Supabase schema, table, RLS, grant, policy, Auth or production data change was made.

The active public endpoint remains:

- `leader-public-lead v10`;
- `verify_jwt=false`.

No CRM UI or `nav_*` file was changed by this migration.

## Remaining work

Cache migration is no longer a blocker.

The next public-site work depends on:

- #235 — real approved portfolio materials;
- #236 — confirmed NAP/contact information;
- a recorded browser end-to-end submission on the published site.
