# CRM autonomous audit checkpoint — 2026-06-30

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: CRM РА «Лидер», только контур `leader_*`.
Mode: autonomous safe pass, no production Supabase mutations.

## What was checked

Read-only checks were performed against GitHub and Supabase.

Checked areas:

- repository identity and project documentation;
- current CRM v4 location and cache markers;
- Supabase project status;
- RA Lider Edge Function versions and JWT modes;
- public `leader_*` SECURITY DEFINER exposure;
- current row-count scale for main CRM tables;
- migration-history caveat;
- remaining manual browser checks.

## Current GitHub baseline

The active repository is `deputat36/lider-bsk`.

The current CRM entry point is:

`https://deputat36.github.io/lider-bsk/crm/v4/`

The direct access/roles route is:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

The public request page is:

`https://www.lider-bsk.ru/request.html`

Current CRM v4 includes:

- leads;
- lead card;
- history and needs;
- calculations;
- commercial offers;
- orders;
- order control;
- finance control;
- production;
- installation;
- public lead audit;
- access and roles;
- self-diagnostics;
- responsive UI.

## Current Supabase read-only baseline

Supabase project status: `ACTIVE_HEALTHY`.

Expected RA Lider Edge Functions are live:

- `leader-public-lead` — version `9`, `verify_jwt=false`;
- `leader-crm-leads` — version `12`, `verify_jwt=true`;
- `leader-crm-orders` — version `2`, `verify_jwt=true`.

Publicly exposed `public.leader_%` SECURITY DEFINER functions for `anon`, `authenticated`, `PUBLIC` / `public`: `0`.

Current main-table scale observed read-only:

| Table | Rows |
| --- | ---: |
| `leader_clients` | 10 |
| `leader_installation_jobs` | 1 |
| `leader_leads` | 11 |
| `leader_orders` | 5 |
| `leader_production_jobs` | 2 |
| `leader_public_lead_audit` | 1 |
| `leader_user_invites` | 0 |
| `leader_user_profiles` | 4 |

Interpretation:

- the CRM is still at a low-data stage;
- unused-index advisor notices are not a reason to drop indexes;
- manual end-to-end request testing is still required;
- public lead audit has too little live coverage to treat the full duplicate/suspicious/rejected contract as browser-proven.

## Main findings

### 1. Manual request chain still blocks full confidence

The critical browser check remains open:

`request.html → leader-public-lead → leader_leads → leader_public_lead_audit → CRM audit → leader_request_trace → duplicate handling`

Required proof:

- first public submission shows the same `request_id` that is stored in audit;
- CRM audit can find the record;
- `Проверить request_id` shows `Цепочка полная`;
- repeated request with the same `request_id` records `duplicate`, not a second `accepted`;
- honeypot input records `suspicious` and does not create a lead.

### 2. Server role matrix should be hardened before adding many users

Current Edge Functions correctly require a valid JWT and an active CRM profile before access. The next hardening step is finer action-level authorization:

- `owner` / `admin`: full CRM access and access management;
- `manager`: leads, calculations, offers, own/client-facing order work;
- `designer`: design/layout-related tasks only;
- `production`: production tasks only;
- `installer`: installation tasks only.

This should be enforced server-side, not only through UI visibility.

### 3. Legacy public RPC references need cleanup planning

Some older public invoker RPC functions reference `public.leader_has_access()` while the actual helper is in `leader_private`.

This is not proven to break current CRM v4 flows because current modules mostly use table access with RLS or Edge Functions. However, it is a technical debt item:

- do not start using those RPCs without checking them;
- prepare a separate migration after migration-history normalization;
- prefer explicit `leader_private.leader_has_access()` or a controlled compatibility wrapper.

### 4. Migration history remains the biggest delivery-process risk

Current GitHub CRM SQL files are final-state snapshots, while live Supabase has its own 14-digit production migration history.

Until normalization is complete:

- live Supabase remains runtime source of truth;
- do not use `supabase db push` as the primary deploy method for this CRM sync set;
- do not add production DDL autonomously;
- do not delete or rename snapshot SQL files blindly.

## Safe autonomous tasks completed in this pass

- Confirmed repository target.
- Confirmed Supabase project health read-only.
- Confirmed current RA Lider Edge Function versions read-only.
- Confirmed public `leader_*` SECURITY DEFINER exposure remains `0` for public/browser roles.
- Created this audit checkpoint.
- Created a server role matrix plan document.
- Created a manual request-chain checklist.
- Added a documentation guard workflow for this checkpoint.

## Tasks intentionally not performed

No production Supabase changes were made.

Not performed without explicit owner approval:

- DDL/migrations;
- DML/data edits;
- Edge Function deploys;
- RLS policy rewrites;
- grants/revoke changes;
- Auth setting changes;
- index drops;
- `nav_*` changes.

## Next safe work queue

1. Keep strengthening GitHub docs/checks around the current CRM state.
2. Prepare Edge Function source sync plan before server role matrix implementation.
3. Prepare manual browser test report template for request-chain proof.
4. Continue only read-only Supabase checks until owner explicitly approves a production mutation.
