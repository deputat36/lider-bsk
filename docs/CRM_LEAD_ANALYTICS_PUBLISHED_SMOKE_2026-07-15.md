# CRM lead analytics published smoke — 2026-07-15

Scope: published static CRM v4 assets served by GitHub Pages on the official domain.

Related issues: #142, #198, #199.

Canonical published URL:

`https://www.lider-bsk.ru/crm/v4/`

GitHub Pages alias:

`https://deputat36.github.io/lider-bsk/crm/v4/`

The alias must redirect to the canonical official domain.

## Purpose

Repository source and the Node runtime harness prove the analytics implementation before merge. This smoke check adds a separate deployment boundary: it verifies that the GitHub Pages deployment actually serves the expected CRM index and analytics assets after changes reach `main`.

The check is read-only. It does not log in, submit forms, call Supabase, use browser storage or create CRM records.

## Checked published files

- the GitHub Pages alias and its redirect to the canonical CRM index;
- the canonical `crm/v4/index.html`;
- `assets/v4/leads.js?v=20260715-filter-state-1`;
- `assets/v4/lead-analytics-badges-v1.js?v=20260709-1`;
- `assets/v4/lead-analytics-summary-v1.js`;
- `assets/v4/lead-analytics-normalization.js`.

## Verified deployment contract

The checker validates:

- HTTP 200 for every final target;
- HTTPS and the exact canonical `www.lider-bsk.ru` origin;
- the expected `/crm/v4/` path prefix after redirects;
- the `deputat36.github.io/lider-bsk/crm/v4/` alias redirects to the canonical origin;
- appropriate HTML or JavaScript content type;
- UTF-8 decoding;
- a bounded response size;
- no HTML fallback for JavaScript assets;
- the current `leads.js` and analytics badges cache markers in the published index;
- the actual `leadHaystack` integration with `leadAnalyticsSearchText`;
- the badges import of the summary module and normalization helper;
- the duplicate-badge guard;
- summary search, active state, toggle-off and reset markers;
- the current service/source normalization exports and site-source mapping.

Every request contains a cache-busting query parameter and `Cache-Control: no-cache` headers.

## Workflow

`.github/workflows/crm-lead-analytics-published-check.yml` runs:

- manually through `workflow_dispatch`;
- once per day on a schedule;
- when the checker, this document or the workflow changes in a pull request;
- after relevant analytics source files are pushed to `main`.

A push to `main` can precede GitHub Pages deployment. For that event the workflow retries for up to approximately five minutes. Pull-request and scheduled checks use a shorter retry window because they validate the already-published `main` state.

The workflow always uploads `published-smoke.log` for seven days, including on failure, so redirect, HTTP or marker problems can be diagnosed without weakening the contract.

## Local command

```bash
python3 tools/check_crm_lead_analytics_published.py
```

Longer deployment wait:

```bash
python3 tools/check_crm_lead_analytics_published.py --attempts 30 --delay 10 --timeout 20
```

## Evidence boundary

A successful published smoke proves that the static deployment contains the expected analytics integration. It does not prove:

- authenticated CRM login;
- successful loading of real leads for a specific role;
- visual placement or readability of badges and summary;
- browser console cleanliness after authenticated data loading;
- correct filtering of a live authenticated lead list.

Those final integration checks remain in `docs/CRM_LEAD_ANALYTICS_BADGES_MANUAL_TEST_2026-07-09.md` before #198 and #199 can be closed.

## Supabase boundary

Read-only status observed on 2026-07-15:

- project `ofewxuqfjhamgerwzull`: `ACTIVE_HEALTHY`;
- `leader-public-lead`: ACTIVE v10, `verify_jwt=false`;
- `leader-crm-leads`: ACTIVE v12, JWT-protected;
- `leader-crm-orders`: ACTIVE v2, JWT-protected.

The published smoke performs no SQL, DDL, DML, Auth, RLS, grants, Edge Function deploy or data changes.
