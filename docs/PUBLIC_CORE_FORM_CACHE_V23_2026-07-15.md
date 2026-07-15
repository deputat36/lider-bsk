# Core public lead form cache v23

Status: completed 2026-07-15.

## Reason

The shared public form script contains the current request trace contract:

- `page_url`;
- `page_path`;
- `page_title`;
- `submitted_at`;
- stable `request_id`;
- retry deduplication;
- consent version;
- UTM fields.

Several high-conversion pages still loaded that shared file through older cache URLs (`v=5` and `v=14`). The repository file was current, but a previously cached response for an old URL could remain in a browser or intermediary cache.

## Core pages pinned to v23

The following pages now load exactly `assets/public-lead-form.js?v=23`:

- `index.html`;
- `request.html`;
- `uslugi.html`;
- `prices.html`;
- `kontakty.html`.

This change does not modify the form implementation or payload. It only gives the current shared script a fresh cache URL on the most important conversion paths.

## Supabase read-only evidence

At the time of the migration:

- production project was `ACTIVE_HEALTHY`;
- `leader-public-lead` was ACTIVE, version 10;
- `leader_leads` contained 13 records;
- the newest record was created manually with source `Вручную` and therefore correctly had no site `request_id` or `source_page_path`;
- the two historical rows with source `Сайт` were created on 2026-06-14, before the current request trace fields were introduced.

The latest manual record was initially treated as a possible attribution gap, then reclassified after a read-only field-level check. No production data was edited.

## Contracts

`tools/check_all_public_form_cache_versions.py` now keeps the global minimum `v=5` for the remaining gradual migration while requiring the five core pages to use exactly `v=23`.

Existing page-specific contracts were updated for the new marker:

- homepage CSS migration;
- request page CSS contract;
- services catalog;
- prices CSS contract;
- contacts assets contract.

`tools/check_public_cache_docs_current.py` also verifies this document and the core page list.

## Boundaries

- production Supabase was not changed;
- no schema, RLS, Auth, grants, Edge Function or row mutation was performed;
- public form fields, messages, endpoint and request payload were not changed;
- CRM UI, `nav_*` and `nav_v2_*` were not changed;
- no controlled browser submission or production smoke was run.
