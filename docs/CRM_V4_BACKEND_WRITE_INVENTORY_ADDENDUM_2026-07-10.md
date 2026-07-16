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

Current write:

- copies a saved calculation into a new editable version inside the same lead;
- inserts one new row into `leader_lead_calculations`;
- inserts the copied and edited item snapshot into `leader_lead_calculation_items`;
- performs a compensating delete of the newly created empty calculation only when item persistence fails.

Current guardrails:

- canonical permission: `calculations.write`;
- the editor module is loaded only after `leader-v4:crm-ready` and only for an active profile allowed by `canPerformV4Action`;
- source `lead_id` must equal the currently opened route lead;
- source calculation and its items remain unchanged;
- old `commercial_offer_id` and `order_id` links are not copied;
- the next version is recalculated from a fresh read using `max(version_number) + 1`;
- the new version is saved as `Черновик`;
- the direct browser path does not receive a service-role credential.

Target classification:

- future server action: `calculation.create_version`;
- target transport: JWT-protected `leader-crm-calculations` Edge Function and atomic RPC;
- calculation row, item rows and idempotency receipt must commit together;
- optimistic concurrency must use the source `updated_at` value;
- the temporary direct-write path remains only until the separately approved production server rollout is complete;
- after cutover, the editor file must be removed from the direct-write inventory rather than leaving two write transports active.

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

Any new CRM v4 JavaScript file containing a direct insert/update/delete must be added to the inventory and assigned a canonical permission/action contract.

## Guardrails

- no production Supabase change was made;
- no direct write was removed before a tested replacement exists;
- no `nav_*` object was inspected or changed for this inventory;
- UI action guards remain defense-in-depth only.