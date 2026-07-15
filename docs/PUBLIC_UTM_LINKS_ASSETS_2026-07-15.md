# Internal UTM links assets — 2026-07-15

Status: completed in source.

Related trackers: #138, #142.

## Scope

The internal noindex page `utm-links.html` was migrated away from executable inline resources.

Added:

- `assets/public-utm-links.css?v=1`;
- `assets/public-utm-links.js?v=1`;
- `tools/check_public_utm_links_assets.py`;
- `.github/workflows/public-utm-links-assets-check.yml`.

## Preserved boundaries

The page remains an internal working tool:

- exact robots marker remains `noindex, nofollow`;
- the page remains absent from `sitemap.xml`;
- all campaign links continue to use `https://www.lider-bsk.ru`;
- no public SEO landing copy, prices, contacts or portfolio claims were changed;
- no public lead form, endpoint or CRM handoff code was changed.

## Usability improvement

Previously only the six channel links had copy buttons. The six service-specific links can now also be copied directly.

All 12 tracked links now have:

- a matching `type="button"` control;
- the same URL in `href` and `data-copy`;
- accessible feedback through `#copy-status` with `role="status"` and `aria-live="polite"`;
- Clipboard API support on secure pages;
- a local textarea fallback when Clipboard API access is unavailable;
- a manual-copy message when automatic copying fails.

The helper does not use network requests, storage, Supabase or analytics.

## Contract

`tools/check_public_utm_links_assets.py` verifies:

1. there are no inline `<style>` blocks or executable inline scripts;
2. the page loads only the dedicated CSS and JavaScript assets;
3. `noindex, nofollow` remains exact;
4. there are exactly 12 unique tracked links and 12 matching copy buttons;
5. every link uses HTTPS and host `www.lider-bsk.ru`;
6. every link contains exactly one non-empty `utm_source`, `utm_medium`, `utm_campaign` and `utm_content`;
7. every non-root target exists in the repository;
8. the internal page is absent from the public sitemap;
9. the copy helper has no `fetch`, Supabase or browser-storage dependency.

## Supabase read-only snapshot

Checked on 2026-07-15:

- project `ofewxuqfjhamgerwzull`: `ACTIVE_HEALTHY`;
- `leader-public-lead`: ACTIVE v10;
- `leader_leads`: 13 rows;
- one row has `request_id` and `source_page_path`;
- the latest row was created manually in CRM and is not evidence of a public-form failure.

Security advisor warnings currently concern `nav_*` / `nav_v2_*` SECURITY DEFINER functions and leaked-password protection. They were not changed because they are outside this public-site package and require separate approval and acceptance work.

Production Supabase schema, RLS, grants, Auth, Edge Functions and data were not changed.
