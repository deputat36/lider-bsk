# CRM v4 backend write inventory addendum — 2026-07-10

Related: #200, #204.

This addendum extends `CRM_V4_BACKEND_WRITE_CONTRACT_INVENTORY_2026-07-10.md` after a broader repository search for `.insert(`, `.update(` and `.delete(` patterns.

## Additional classified browser writes

### `crm/v4/assets/v4/lead-create.js`

Current write:

- direct insert into `leader_leads` for manually created CRM leads.

Current metadata is already v4-specific:

- `page_url: CRM v4 / ручное создание`;
- payload `created_from: crm_v4_manual`;
- actor ID/email in payload.

Target classification:

- canonical action: `leads.create`;
- short term: may remain direct only after server-side role-scoped RLS allows the action;
- preferred target: Edge/RPC command with server phone normalization, actor audit and optional duplicate-phone warning;
- do not route manual leads through the public website intake contract.

### `crm/v4/assets/v4/lead-timeline.js`

Current write:

- direct insert into `leader_lead_events` for manager comments/history.

Target classification:

- canonical action: `leads.update` or a future dedicated `lead_events.write` key;
- event author must be derived/validated server-side;
- event creation should be part of the same transaction as a status/next-contact transition when those fields change;
- free-standing comments may remain a narrow direct insert only under role-scoped RLS.

### `crm/v4/assets/v4/calculation-catalog-create-v1.js`

Current write:

- narrow direct insert into `leader_catalog` when owner/admin creates reusable nomenclature from the unified calculation workspace.

Current classification:

- canonical action: `catalog.manage` / `CRM_V4_ACTIONS.CATALOG_MANAGE`;
- UI exposes the form only to active owner/admin profiles;
- exact staging is fail-closed and performs no `leader_catalog` request because the staging compatibility schema intentionally has no catalog table;
- production insert uses the ordinary authenticated browser client and existing `leader_catalog_insert_admin` RLS policy;
- no service-role key, elevated browser credential, RPC bypass or Edge bypass is introduced;
- duplicate names and RLS denial are surfaced as user-facing errors;
- this narrow single-table write may remain direct while role-scoped RLS is the server enforcement boundary;
- any future multi-table catalog mutation or audit-sensitive catalog workflow should move behind a versioned server action.

### `crm/v4/assets/v4/calculation-version-editor-v1.js`

Purpose:

- copies a saved calculation into a new editable version inside the same lead;
- preserves the source calculation, source items and existing КП/order links;
- prepares a new `Черновик` without inherited links.

Current routes:

- staging route: JWT Edge/RPC без browser writes;
- production route: fail-closed.

Staging route:

- selected only for the exact staging Supabase URL;
- invokes `leader-crm-calculations` through the current authenticated session;
- sends canonical action `calculation.create_version`;
- uses canonical permission `calculations.write`;
- sends source `updated_at`, a stable idempotency key and a minimized item projection;
- calculation row, item rows and idempotency receipt commit together;
- does not contain browser INSERT, UPDATE, DELETE, UPSERT, direct RPC or compensating delete;
- cannot fallback to any production write path after an Edge error.

Production route:

- resolves to `production_locked`;
- the action is shown as `Новая версия — недоступно`;
- the button carries `aria-disabled=true` and a clear explanation;
- browser INSERT/DELETE are removed;
- no calculation row or item row is created;
- no compensating delete is attempted;
- production remains locked until the server action is separately deployed and approved.

Shared guardrails:

- canonical permission: `calculations.write`;
- server action: `calculation.create_version`;
- the editor module is loaded only after `leader-v4:crm-ready` and only for an active profile allowed by `canPerformV4Action`;
- source `lead_id` must equal the currently opened route lead;
- source calculation and its items remain unchanged;
- old `commercial_offer_id` and `order_id` links are not copied;
- the browser never receives a service-role credential;
- production config does not activate staging transport.

Current classification:

- the editor is removed from the direct-write inventory;
- the retained fresh-preflight model is pure and performs no persistence;
- production cutover still requires explicit approval, production RPC/index and Edge deployment;
- after production rollout the same Edge/RPC action may be enabled by an explicit route change, without restoring browser writes.

## Confirmed direct-write file set

The source checker classifies these CRM v4 files:

- `calculation-catalog-create-v1.js`;
- `calculations-advanced.js`;
- `calculations-standard.js`;
- `calculations.js`;
- `contact-control-v1.js`;
- `followups.js`;
- `installation-job-card-v2.js`;
- `lead-card.js`;
- `lead-create.js`;
- `lead-timeline.js`;
- `leads.js`;
- `needs.js`;
- `offers.js`;
- `production-job-card-v2.js`;
- `user-admin-v1.js`.

`calculation-version-editor-v1.js` is intentionally absent because it now contains only read operations and the exact staging Edge invocation.

Any new CRM v4 JavaScript file containing a direct insert/update/delete must be added to the inventory and assigned a canonical permission/action contract.

## Guardrails

- no production Supabase change was made;
- no staging Supabase change was made by the production-lock change;
- normal creation in the existing unified calculator remains outside this lock and is unchanged;
- no `nav_*` object was inspected or changed for this inventory;
- UI action guards remain defense-in-depth only.
