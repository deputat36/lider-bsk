# CRM v4 backend write contract inventory — 2026-07-10

Related: #200, #202, #204.

Mode: GitHub source inspection and live Edge Function read-only inspection. No production Supabase changes were made.

## Decision summary

Target split:

- simple, non-sensitive reads may remain direct Supabase REST under correct RLS;
- privileged, multi-table, state-transition and audit-sensitive writes must use versioned RPC/Edge actions;
- UI role visibility is not authorization;
- each write action must have a canonical permission key, validation contract, transaction boundary and audit event.

## Current direct browser writes

### Lead operations

Files:

- `crm/v4/assets/v4/leads.js`;
- `crm/v4/assets/v4/lead-card.js`;
- `crm/v4/assets/v4/followups.js`;
- `crm/v4/assets/v4/contact-control-v1.js`;
- `crm/v4/assets/v4/offers.js`.

Current writes include:

- lead status;
- lead quality;
- estimated amount;
- next contact;
- rejection reason/message;
- automatic lead status changes when КП changes.

Recommendation:

- direct write may remain only for narrowly allowed lead fields after server-side RLS permission enforcement;
- transition-sensitive operations should use `lead.transition` command;
- assignment must use `lead.assign` command;
- every transition should write a lead event/audit record.

### Needs

File:

- `crm/v4/assets/v4/needs.js`.

Current writes:

- insert need;
- archive need;
- client-side completeness score and missing fields.

Recommendation:

- `need.create` / `need.update` can remain direct only after role-scoped RLS;
- completeness calculation should be duplicated or moved server-side before it becomes a blocking gate;
- archive is a state transition, not delete.

### Calculations

Files:

- `crm/v4/assets/v4/calculations.js`;
- `crm/v4/assets/v4/calculations-standard.js`;
- `crm/v4/assets/v4/calculations-advanced.js`.

Current write pattern includes:

- create/update calculation header;
- delete/reinsert calculation items;
- update lead/need/calculation status;
- standard and advanced calculators insert related records.

Risks:

- partial save when one write fails;
- item set can temporarily disappear;
- `catalog_id` trace is lost by `calcItem`;
- browser controls totals, profit and margin payloads.

Target:

- transactional `calculation.save` RPC/Edge action;
- server recomputes totals/profit/margin from validated items;
- preserve `catalog_id`;
- one audit event and one version increment.

### Commercial offers

Files:

- `crm/v4/assets/v4/offers.js`;
- `crm/v4/assets/v4/offer-card-v1.js`;
- `crm/v4/assets/v4/offer-order-create-v1.js`.

Current `createOffer` sequence:

1. insert commercial offer;
2. update calculation link/status;
3. update lead status;
4. insert offer event.

Current `updateOfferStatus` sequence:

1. update offer;
2. update calculation status;
3. update lead status;
4. insert offer event.

Risks:

- multi-table partial state;
- audit insert is best-effort and can silently fail;
- duplicate transitions are possible;
- client controls status mapping.

Target:

- transactional `offer.create_from_calculation`;
- transactional `offer.transition`;
- allowed transition registry;
- mandatory event write in the same transaction.

`offer.create_order` already uses `leader_create_order_from_offer_rpc` through the Edge action and is the preferred pattern.

### Orders

Files:

- `crm/v4/assets/v4/orders.js`;
- `crm/v4/assets/v4/order-card-v1.js`;
- `crm/v4/assets/v4/order-control-v2.js`;
- `crm/v4/assets/v4/offer-order-create-v1.js`.

Existing server paths:

- `leader-crm-leads` action `create_order`;
- `leader-crm-leads` action `create_order_from_offer`;
- `leader-crm-orders` actions `list` and `update`;
- `leader_create_order_from_offer_rpc`.

Problems:

- two Edge Functions overlap;
- `create_order` manually creates client/order/items/lead link without a database transaction;
- `leader-crm-leads` contains legacy `manual://crm-v2`, `created_from: crm_v2`, `source_ui: crm_v2` markers;
- `leader-crm-orders` update allows a broad set of fields after only active-profile check;
- both functions use `Access-Control-Allow-Origin: *`;
- neither function checks granular action permissions.

Target:

- retain transaction-backed `order.create_from_offer`;
- replace non-transactional `create_order` with an RPC transaction;
- create `order.transition`, `order.update_deadline` and explicit finance/production commands;
- remove legacy v2 markers only after compatibility migration;
- restrict CORS to approved CRM origins where practical;
- require canonical permission keys.

### Production

Files:

- `crm/v4/assets/v4/production-job-card-v2.js`;
- `crm/v4/assets/v4/production-board-v3.js`.

Current save sequence:

1. update production job;
2. update order production/layout/current stage;
3. insert production event.

Target:

- transactional `production_job.update`;
- server validates allowed status transition;
- order stage and event update in the same transaction;
- cost/internal fields returned only when permission allows.

Source-only data minimization is already implemented, but server isolation remains pending.

### Installation

File:

- `crm/v4/assets/v4/installation-job-card-v2.js`.

Current save sequence:

1. update installation job;
2. update order installation/current stage;
3. insert installation event.

Internal comment insert is a separate browser write.

Target:

- transactional `installation_job.update`;
- separate `installation_comment.add_internal` permission;
- restrict comments and costs server-side;
- event and order stage update in the same transaction.

### User administration

File:

- `crm/v4/assets/v4/user-admin-v1.js`.

Current/related operations include profile updates and invite management.

Target:

- all user/profile/invite mutations remain privileged Edge/RPC actions;
- require `users.manage`;
- never rely on hidden UI controls;
- log actor, target, old role/status and new role/status.

### Finance, catalog and settings

Modules exist for finance, catalog-related calculation use and CRM settings.

Target:

- finance reads require `finance.read`;
- payment/expense writes require `finance.write`;
- cost reads require `costs.read`;
- catalog mutations require `catalog.manage`;
- settings require `settings.manage`;
- user administration requires `users.manage`.

## Live Edge action inventory

### `leader-crm-leads` v12

Actions:

- `ensure_profile`;
- `dashboard`;
- `list`;
- `list_orders`;
- `create`;
- `update`;
- `ensure_client`;
- `create_order`;
- `create_order_from_offer`.

Authorization today:

- valid JWT;
- active `leader_user_profiles` row.

Missing:

- action-level permission;
- role-specific field allowlists;
- transaction for manual order creation;
- consistent audit events;
- v4 metadata.

### `leader-crm-orders` v2

Actions:

- `list`;
- `update`.

Authorization today:

- valid JWT;
- active profile.

Missing:

- `orders.read` / `orders.write` permission distinction;
- transition validation;
- audit event;
- restricted CORS.

## Canonical permission keys

Proposed v1 keys:

### Leads and clients

- `leads.read`;
- `leads.create`;
- `leads.update`;
- `leads.assign`;
- `leads.transition`;
- `clients.read`;
- `clients.write`.

### Needs, calculations and offers

- `needs.read`;
- `needs.write`;
- `calculations.read`;
- `calculations.write`;
- `costs.read`;
- `offers.read`;
- `offers.write`;
- `offers.transition`.

### Orders and execution

- `orders.read`;
- `orders.create`;
- `orders.update`;
- `orders.transition`;
- `production.read`;
- `production.write`;
- `installation.read`;
- `installation.write`;
- `design.read`;
- `design.write`.

### Finance and administration

- `finance.read`;
- `finance.write`;
- `catalog.read`;
- `catalog.manage`;
- `audit.read`;
- `users.manage`;
- `settings.manage`.

## Proposed role baseline

### owner / admin

All permissions.

### manager

Lead/client/need/calculation/offer/order operational permissions, production/installation reads and operational writes, audit read; no finance/cost/user/settings management by default.

### accountant

Orders read, finance read/write, costs read.

### designer

Design read/write and production read limited to design context; no costs.

### installer

Installation read/write; no production jobs, costs, clients, finance or internal management notes.

### contractor

Production read/write; no installation jobs, costs, clients, finance or internal management notes.

## Command contract shape

Every privileged command should accept:

```json
{
  "action": "domain.command",
  "request_id": "uuid",
  "entity_id": "uuid",
  "expected_updated_at": "ISO timestamp",
  "payload": {}
}
```

Every success should return:

```json
{
  "ok": true,
  "request_id": "uuid",
  "entity": {},
  "events": []
}
```

Every error should return a stable error code, not raw Postgres/service-role details.

`expected_updated_at` provides optimistic concurrency for mutable cards.

## Audit contract

Each privileged command must record:

- action key;
- actor user ID and email;
- actor role;
- entity type and ID;
- request ID;
- old/new status where applicable;
- success/failure code;
- timestamp;
- privacy-safe metadata only.

## Migration order

1. Freeze canonical permission/action registry in GitHub source.
2. Add source checkers and role/action test matrix.
3. Implement new transaction-backed actions on Supabase development branch.
4. Add server permission helper using role permissions.
5. Migrate one domain at a time:
   - offers;
   - calculations;
   - production;
   - installation;
   - lead transitions;
   - manual order creation;
   - finance/admin.
6. Keep direct reads under tightened RLS.
7. Remove legacy write paths only after browser proof and telemetry.
8. Re-run advisors, grants/policies inspection and rollback tests.

## Immediate source-only actions

- create canonical permission/action registry;
- add frontend action guard helper;
- document compatibility between existing actions and target actions;
- add checkers that prevent new unclassified direct writes;
- do not deploy server enforcement before approval.

## Guardrails

- no production DDL/DML in this inventory;
- no Edge deploy;
- no RLS/grant/Auth changes;
- no `nav_*` changes;
- no removal of a live path before a tested replacement exists.
