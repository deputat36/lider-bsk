# CRM status addendum — 2026-06-30

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: CRM РА «Лидер», only `leader_*`.

This addendum records the autonomous work performed after `docs/STATUS.md` was last updated on 2026-06-28.

## Completed GitHub work

### PR #135 — CRM autonomous audit checkpoint

Merged into `main`.

Added:

- `docs/CRM_AUTONOMOUS_AUDIT_2026-06-30.md`;
- `docs/CRM_SERVER_ROLE_MATRIX_2026-06-30.md`;
- `docs/CRM_PUBLIC_REQUEST_CHAIN_CHECK_2026-06-30.md`;
- `tools/check_crm_autonomous_audit_docs.py`.

Purpose:

- preserve the read-only audit checkpoint;
- document the server-side role matrix plan;
- create a browser checklist for public request chain proof;
- keep local marker checks for the new docs.

### PR #136 — Document Supabase Edge Function sources

Merged into `main`.

Added:

- `supabase/functions/README.md`;
- `tools/check_supabase_edge_function_sources.py`.

Purpose:

- document that GitHub stores Edge Function source snapshots;
- make explicit that editing GitHub source does not deploy Supabase production;
- add local checks for source markers and obvious secret-like strings.

### PR #137 — Prepare CRM order Edge Function role matrix

Merged into `main`.

Changed:

- `supabase/functions/leader-crm-orders/index.ts`.

Added:

- `ROLE_MATRIX_VERSION = '20260630-edge-role-matrix-1'`;
- server-side role matrix for `leader-crm-orders` source snapshot;
- field-level update checks for order actions.

Current source snapshot permissions:

- `owner` / `admin`: full access;
- `manager`: list and any order update;
- `designer`: list, `layout_status`, `layout_comment`;
- `production`: list, `production_status`, `layout_comment`;
- `installer`: list only.

Important: this is a GitHub source change only. It has not been deployed to Supabase production.

## Completed issue tracking

### Issue #139 — CRM: добавить серверную матрицу ролей в leader-crm-leads

Created and left open.

Purpose:

- track the remaining hardening step for `supabase/functions/leader-crm-leads/index.ts`;
- preserve the action matrix and acceptance criteria;
- note that the previous large connector patch was blocked and should be handled through a smaller/local patch.

## Supabase live state after the work

Read-only check only.

Supabase project remains active and healthy.

Live RA Lider Edge Functions remain unchanged:

- `leader-public-lead v9`, `verify_jwt=false`;
- `leader-crm-leads v12`, `verify_jwt=true`;
- `leader-crm-orders v2`, `verify_jwt=true`.

No Supabase production mutation was performed:

- no DDL;
- no DML;
- no Edge Function deploy;
- no RLS change;
- no grants/revokes;
- no Auth setting change;
- no index change;
- no `nav_*` change.

## Current open work

1. Complete `leader-crm-leads` server role matrix in GitHub source snapshot.
2. Run local source checks:
   - `python3 tools/check_crm_autonomous_audit_docs.py`;
   - `python3 tools/check_supabase_edge_function_sources.py`.
3. Perform manual browser test from `docs/CRM_PUBLIC_REQUEST_CHAIN_CHECK_2026-06-30.md`.
4. Decide separately whether to deploy updated `leader-crm-orders` after owner approval.
5. If deployment is approved, deploy only the intended Edge Function and run role-specific browser/API checks.

## Manual checks still required

The public request chain is not considered fully proven until the browser checklist passes:

- normal request creates one lead and one `accepted` audit event;
- request number shown to the user equals stored `request_id`;
- `Проверить request_id` shows `Цепочка полная`;
- duplicate request records `duplicate`, not a second `accepted`;
- honeypot records `suspicious` and creates no lead;
- invalid empty request records `rejected` and creates no lead.

## Deployment rule

Do not deploy Edge Functions from GitHub source to Supabase production without explicit owner approval.

Do not use `supabase db push` or preview branches as the primary CRM DB deployment method until migration-history normalization is complete.
