# Public lead attribution read-only check — 2026-07-05

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: RA Lider public site → CRM lead handoff.

This document records a read-only aggregate check. No personal lead data is included. No Supabase DDL, DML, Edge Function deploy, RLS, grants, policies or data changes were performed.

## Table checked

`public.leader_leads`.

Relevant attribution columns are present:

- `request_id`;
- `source_page_path`;
- `submitted_at`;
- `page_url`;
- UTM fields: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.

## Aggregate result

Read-only aggregate result:

- total leads: `12`;
- leads with `source_page_path`: `1`;
- leads with `request_id`: `1`;
- leads with `submitted_at`: `1`;
- first lead created at: `2026-06-07 09:44:56.778722+00`;
- last lead created at: `2026-07-01 14:20:01.704428+00`.

## Interpretation

The database has the right attribution columns, but most historical leads do not have the newer attribution fields filled. This matches the public-site tracker note that recent form improvements exist, but historical data has limited source attribution.

## Recommended next checks

1. After the next real public form submission, verify that `request_id`, `source_page_path` and `submitted_at` are filled.
2. Keep improving public pages through #185, #191 and #195 so the latest `assets/public-lead-form.js` helper reaches all safe pages.
3. Do not backfill attribution values without a separate explicit data-change approval.

## Related work

- #142 — public site growth audit.
- #185 — public lead form cache bust.
- #191 — large public landing page CSS extraction.
- #195 — first page migration for `pechat-bannerov-borisoglebsk.html`.
