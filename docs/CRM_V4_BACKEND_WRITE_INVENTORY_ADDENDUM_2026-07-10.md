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

### `crm/v4/assets/v4/calculation-version-editor-v1.js`

Purpose:

- copies a saved calculation into a new editable version inside the same lead;
- preserves the source calculation, source items and existing КП/order links;
- saves the new version as `Черновик` without inherited links.

Current dual route:

- staging route: JWT Edge/RPC без browser writes;
- production route: temporary direct-write path.

Staging route:

- selected only for the exact staging Supabase URL;
- invokes `leader-crm-calculations` through the current authenticated session;
- sends canonical action `calculation.create_version`;
- uses permission `calculations.write`;
- sends source `updated_at`, a stable idempotency key and a minimized item projection;
- calculation row, item rows and idempotency receipt commit together;
- does not contain `.from`, `.insert`, `.update`, `.delete`, `.upsert`, browser RPC or compensating delete;
- cannot fallback to the production legacy path after an Edge error.

Production legacy route:

- inserts one new row into `leader_lead_calculations`;
- inserts the copied and edited item snapshot into `leader_lead_calculation_items`;
- performs a compensating delete of the newly created empty calculation only when item persistence fails;
- recalculates the next version from a fresh read using `max(version_number) + 1`;
- remains classified as a direct browser write until production server rollout.

Shared guardrails:

- canonical permission: `calculations.write`;
- the editor module is loaded only after `leader-v4:crm-ready` and only for an active profile allowed by `canPerformV4Action`;
- source `lead_id` must equal the currently opened route lead;
- source calculation and its items remain unchanged;
- old `commercial_offer_id` and `order_id` links are not copied;
- the new version is saved as `Черновик`;
- the browser never receives a service-role credential.

Target classification:

- server action: `calculation.create_version`;
- target transport: JWT-protected `leader-crm-calculations` Edge Function and atomic RPC;
- optimistic concurrency uses the source `updated_at` value;
- source wiring is present but current production config keeps it fail closed;
- production cutover still requires explicit approval and production backend deployment;
- after production cutover legacy-функции и compensating delete должны быть удалены;
- the editor file must then be removed from the direct-write inventory rather than leaving two write transports active.

## Confirmed direct-write file set

The source checker classifies these CRM v4 files:

- `calculation-version-editor-v1.js`;
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

`calculation-version-editor-v1.js` remains in this list only because the production legacy branch still contains classified browser writes. The staging branch itself is write-free.

Any new CRM v4 JavaScript file containing a direct insert/update/delete must be added to the inventory and assigned a canonical permission/action contract.

## Guardrails

- no production Supabase change was made;
- no direct write was removed before a tested replacement exists;
- no `nav_*` object was inspected or changed for this inventory;
- UI action guards remain defense-in-depth only.
