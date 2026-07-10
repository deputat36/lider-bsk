# CRM v4 backend command contract — 2026-07-10

Related: #200, #202, #204, #217.

Mode: source-only contract and read-only Supabase audit. It is not enforced by production Edge Functions, RPCs, RLS or browser writes.

Machine-readable source:

`contracts/crm-v4-backend-command-contract-v1.json`

Contract version:

`leader-backend-command-contract-v1`

Current status:

`source_only_not_enforced`

Validator:

`tools/check_crm_v4_backend_command_contract.py`

## Single source of truth for statuses

`crm/v4/assets/v4/status-transitions-v1.js is the only authoritative status graph`.

The backend command contract does not repeat `allowedTo`, terminal flags, aliases, timestamps or transition permissions. It references:

- `CRM_STATUS_REGISTRY_VERSION`;
- `CRM_STATUS_DOMAINS`;
- canonical domains `lead`, `offer`, `order`, `production` and `installation`.

This separation prevents browser and future server code from drifting into two competing status graphs.

## Contract ownership

The backend command contract owns:

- command names;
- canonical permission keys;
- request and result envelopes;
- transaction boundaries;
- optimistic concurrency requirements;
- required payload fields;
- audit table and stable audit event;
- side effects that must commit or roll back together.

The status registry owns:

- canonical status keys and Russian labels;
- aliases;
- terminal states;
- allowed transitions;
- transition-specific permissions;
- timestamp fields;
- status audit-event names.

## Standard request envelope

```json
{
  "action": "domain.command",
  "request_id": "uuid",
  "entity_id": "uuid when updating an existing entity",
  "expected_updated_at": "ISO timestamp when concurrency applies",
  "payload": {}
}
```

Rules:

- `request_id` is mandatory and supports idempotent retry;
- `expected_updated_at` is mandatory for mutable existing entities;
- stale writes return `conflict` and must not overwrite newer data;
- duplicate requests return the original successful result or `duplicate_request` according to the server implementation;
- raw database, JWT, service credential and stack details are never returned.

## Standard success envelope

```json
{
  "ok": true,
  "request_id": "uuid",
  "entity": {},
  "events": []
}
```

Stable error codes:

- `access_denied`;
- `unknown_action`;
- `validation_error`;
- `forbidden`;
- `not_found`;
- `conflict`;
- `invalid_transition`;
- `duplicate_request`;
- `persistence_failed`.

## Command inventory

| Command | Permission | Status domain | Concurrency | Audit target |
|---|---|---|---|---|
| `calculation.save` | `calculations.write` | temporarily legacy | update only | `leader_activity_log` |
| `offer.create_from_calculation` | `offers.write` | offer | required | `leader_commercial_offer_events` |
| `offer.transition` | `offers.transition` | offer | required | `leader_commercial_offer_events` |
| `order.create_from_offer` | `orders.create` | order | required | `leader_activity_log` |
| `order.create_manual` | `orders.create` | order | not applicable | `leader_activity_log` |
| `order.transition` | `orders.transition` | order | required | `leader_activity_log` |
| `lead.transition` | `leads.transition` | lead | required | `leader_lead_events` |
| `production_job.update` | `production.write` | production | required | `leader_production_events` |
| `installation_job.update` | `installation.write` | installation | required | `leader_installation_events` |

All permissions must exist in `crm/v4/assets/v4/action-permissions-v1.js`.

## Calculation status exception

The canonical status registry currently has no separate calculation domain.

Therefore `calculation.save` explicitly uses:

`legacy_calculation_status_until_server_contract`

This is not permission to invent a second transition graph. A development-branch implementation must either:

1. add a calculation domain to the canonical status registry through a reviewed source change; or
2. keep calculation status synchronization inside a narrowly defined command while preserving existing live values.

## Atomic operations

### calculation.save

Must commit or roll back together:

- calculation header;
- replacement item set;
- server-side totals;
- lead synchronization;
- one audit event.

### offer.create_from_calculation / offer.transition

Must commit or roll back together:

- offer insert or status change;
- calculation link/status synchronization;
- lead status synchronization;
- canonical timestamp;
- offer event.

### order creation and transition

Must commit or roll back together:

- order and item rows;
- client/lead/offer/calculation links;
- duplicate-order protection;
- status timestamp;
- one audit event.

### production and installation updates

Must commit or roll back together:

- job update;
- canonical transition validation;
- order-stage synchronization;
- corresponding event row.

A successful business write followed by a best-effort audit insert is not acceptable.

## Read-only Supabase evidence

The production project was inspected without mutation.

Confirmed event/audit targets:

- `leader_lead_events`;
- `leader_commercial_offer_events`;
- `leader_production_events`;
- `leader_installation_events`;
- `leader_activity_log`.

`leader_activity_log` provides actor, action, entity, entity ID, JSON metadata and timestamp fields. Future commands must store privacy-safe metadata only.

Live status values were inspected only to confirm compatibility with the separate canonical status registry. They are not copied into this command contract.

## Development-branch implementation order

1. Create or rebase an approved Supabase development branch.
2. Generate a server-owned representation from this command contract and the canonical status registry.
3. Implement one domain first, preferably offer transitions.
4. Resolve authenticated user and active `leader_crm_profiles` role server-side.
5. Check canonical permission server-side and fail closed for unknown roles/actions.
6. Validate target status with `status-transitions-v1.js` contract data.
7. Enforce `request_id` idempotency and `expected_updated_at` concurrency.
8. Apply business write, dependent synchronization and audit in one transaction.
9. Run positive, forbidden-role, stale-version, invalid-transition, duplicate-request and rollback tests.
10. Record evidence before any production approval.

## Production boundary

No production DDL or DML was executed.

No Edge Function, RPC, trigger, enum, constraint, RLS policy, grant, Auth setting or Storage object was changed.

No historical status was rewritten.

No `nav_*`, Parket or Broker object was touched.

## Remaining work

- generate a server-consumable registry without duplicating status definitions;
- implement and test commands in a Supabase development branch;
- add server-side role/action enforcement;
- add transactional idempotency and optimistic concurrency;
- verify role-specific result projections;
- remove direct browser writes only after tested replacement and rollback proof;
- obtain explicit approval before production deployment.
