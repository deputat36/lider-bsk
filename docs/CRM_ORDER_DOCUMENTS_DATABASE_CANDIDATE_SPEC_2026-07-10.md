# Persistent order documents — database candidate specification

Date: 2026-07-10.

Related: #200, #202, #204, #214, #215, #217, #219.

Mode: architecture specification only. No migration file was created and no production Supabase change was applied.

## Safety decision

A complete executable SQL draft was intentionally not committed after the GitHub connector blocked the write. The design is recorded as a non-executable specification so it cannot be applied accidentally.

A real migration must be generated only in a Supabase development branch after cost confirmation, review and explicit approval.

## Target objects

### `leader_document_number_counters`

Purpose: concurrency-safe yearly numbering.

Columns:

- `document_type text` — initially only `act`;
- `number_year integer`;
- `last_value bigint`;
- `updated_at timestamptz`.

Primary key:

`(document_type, number_year)`

Allocation pattern:

1. insert `(act, year, 1)`;
2. on conflict increment `last_value` atomically;
3. return the allocated value;
4. format `АВР-YYYY-NNNN`.

The browser must never calculate the final number.

### `leader_order_documents`

Each row is one version of a logical document.

Identity and lineage:

- `id uuid`;
- `document_group_id uuid`;
- `previous_version_id uuid`;
- `version integer`;
- unique `(document_group_id, version)`.

Business links:

- `owner_id uuid`;
- `order_id uuid` → `leader_orders`, `ON DELETE RESTRICT`;
- `client_id uuid` → `leader_clients`, `ON DELETE SET NULL`.

Document identity:

- `document_type text` — initially `act`;
- `document_number text`, nullable for drafts;
- `number_year integer`;
- `number_sequence bigint`;
- `document_date date`;
- `completion_date date`.

Lifecycle:

- `status text`;
- `generated_at`;
- `sent_at`;
- `signed_at`;
- `voided_at`;
- `void_reason`.

Content and totals:

- `title`;
- `basis`;
- `currency`, initially `RUB`;
- `tax_mode`;
- `subtotal numeric(14,2)`;
- `tax_amount numeric(14,2)`;
- `total numeric(14,2)`;
- `snapshot_schema_version integer`;
- `snapshot jsonb`;
- `snapshot_hash text`.

File metadata:

- `file_path`;
- `file_hash`;
- `file_size_bytes`.

Control fields:

- `idempotency_key text`;
- `created_by`;
- `updated_by`;
- `created_at`;
- `updated_at`.

Required constraints:

- document type is allowed;
- version is positive;
- status belongs to the canonical document lifecycle;
- totals are non-negative;
- `subtotal + tax_amount = total` after rounding;
- final statuses require a document number;
- `Подписан` requires `signed_at`;
- `Аннулирован` requires `voided_at` and reason;
- snapshot is a JSON object;
- idempotency key length is bounded;
- document number is unique when present;
- idempotency key is unique when present.

Recommended indexes:

- `(order_id, created_at desc)`;
- `(document_group_id, version desc)`;
- `(status, created_at desc)`;
- partial unique index on `document_number`;
- partial unique index on `idempotency_key`.

### `leader_order_document_events`

Purpose: immutable audit trail.

Columns:

- `id`;
- `document_id`;
- `order_id`;
- `event_type`;
- `old_status`;
- `new_status`;
- `comment`;
- `payload jsonb`;
- `created_by`;
- `created_by_email`;
- `created_at`.

Recommended indexes:

- `(document_id, created_at desc)`;
- `(order_id, created_at desc)`.

No UPDATE or DELETE should be available through normal application commands.

## Access baseline

All three new tables are in `public`, therefore RLS must be enabled immediately.

Candidate v1 access:

- revoke all table privileges from `PUBLIC`, `anon`, and `authenticated`;
- grant only the minimum SELECT/INSERT/UPDATE privileges to `service_role`;
- no direct browser policies;
- browser reads and writes go through reviewed Edge/RPC actions with role-specific projections.

This is intentionally stricter than some legacy `leader_*` tables.

## RPC candidate: `leader_create_order_act_rpc(jsonb)`

The function is `SECURITY DEFINER`, service-role-only, with a fixed search path.

Explicitly revoke EXECUTE from:

- `PUBLIC`;
- `anon`;
- `authenticated`.

Grant EXECUTE only to `service_role`.

### Required input

- trusted `actor_id` supplied by the authenticated Edge Function;
- `order_id`;
- `idempotency_key`;
- target status: `Черновик` or `Сформирован`;
- optional `document_group_id` for a new version;
- whitelisted editable document fields;
- optional item override array.

### Actor checks

1. Load `leader_user_profiles` by actor ID.
2. Require active profile.
3. Allow owner/admin/manager/accountant to generate.
4. Do not allow accountant to create a persisted editable draft unless the matrix is explicitly changed.
5. Deny designer/installer/contractor and unknown roles.

### Idempotency

Before locking the order, look up the idempotency key.

When found, return the existing safe document reference without allocating another number or inserting another row.

### Order and item validation

1. Lock the order row.
2. Load the linked client.
3. Load approved company settings.
4. Use client-facing order items only.
5. If item overrides are supplied, validate each name, quantity, unit and price.
6. Recalculate line totals server-side.
7. Reject empty or non-positive documents.
8. Compare the recalculated subtotal with `order.client_total`.
9. A mismatch override may be allowed only for owner/admin with an explicit flag and audit evidence.

Never include:

- contractor cost;
- contractor price;
- profit or margin;
- internal comments;
- raw order JSON;
- unrelated personal data.

### Version rules

- a new group starts at version 1;
- a new version locks and reads the latest group row;
- the group must belong to the same order;
- signed documents cannot be silently versioned in the same group;
- a corrected document after signing requires an explicitly designed correction flow.

### Numbering rules

- drafts have no final legal number;
- generated documents allocate the yearly counter atomically;
- number format is `АВР-YYYY-NNNN`;
- voided numbers are never reused;
- number allocation and document insert occur in one transaction.

### Snapshot

The server builds the JSON snapshot.

Minimum sections:

- schema version;
- document identity and dates;
- basis;
- executor and approved legal details;
- customer details;
- order reference and statuses at snapshot time;
- client-facing items;
- currency, subtotal, tax mode, tax amount and total;
- completion and claims text;
- note;
- actor and creation timestamp.

Calculate and store a deterministic snapshot hash.

### Result

Return only a safe reference:

- document ID;
- group ID;
- version;
- document number;
- status;
- total;
- snapshot hash;
- duplicate flag.

Do not return hidden order financial fields.

## RPC candidate: `leader_transition_order_document_rpc(jsonb)`

The function is also SECURITY DEFINER and service-role-only.

Required input:

- actor ID;
- document ID;
- expected current status;
- target status;
- optional comment;
- void reason when required.

Allowed target actions:

- `Отправлен клиенту` → `documents.send`;
- `Подписан` → `documents.sign`;
- `Аннулирован` → `documents.void`.

Role baseline:

- send: owner/admin/manager/accountant;
- sign: owner/admin/accountant;
- void: owner/admin only.

Transition baseline:

- `Сформирован → Отправлен клиенту`;
- `Сформирован → Подписан`;
- `Отправлен клиенту → Подписан`;
- `Черновик/Сформирован/Отправлен клиенту → Аннулирован`;
- `Подписан` and `Аннулирован` are terminal.

The function must:

1. lock the document;
2. reject stale expected status;
3. reject forbidden/terminal transitions;
4. set lifecycle timestamp;
5. write an event row;
6. commit status and event atomically;
7. return a safe reference.

## Storage candidate

PDF files are private by default.

Store only a private object path in the document row.

Required controls:

- role-checked signed URL generation;
- short expiry;
- no public bucket;
- stable file hash;
- versioned file names;
- no overwrite of a signed version;
- removal/retention policy reviewed separately.

Suggested path pattern:

`leader/order-documents/{order_id}/{document_id}/v{version}/act.pdf`

## Development-branch tests

Use the acceptance plan:

`docs/SUPABASE_DEV_BRANCH_CRM_HARDENING_ACCEPTANCE_PLAN_2026-07-10.md`

Mandatory tests:

- RLS enabled;
- no anon/authenticated table grants;
- RPC EXECUTE revoked from PUBLIC/anon/authenticated;
- service-role-only execution;
- active and role checks;
- item/total validation;
- concurrent numbering;
- idempotent duplicate request;
- version lineage;
- signed/voided terminal protection;
- snapshot excludes internal fields;
- event trail atomicity;
- private PDF access;
- security/performance advisors;
- rollback rehearsal.

## Migration creation gate

Do not copy this specification directly into production SQL.

Before creating a migration:

1. re-read live schema and policy/grant drift;
2. rebase/create a Supabase development branch after cost approval;
3. produce a reviewed migration using the current Supabase CLI/process;
4. create branch-only fixtures and tests;
5. run advisors;
6. record rollback evidence;
7. obtain explicit production approval.

No `nav_*` object may be changed.
