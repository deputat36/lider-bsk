# CRM backend command contract execution addendum — 2026-07-10

Related: #200, #202, #204, #217.

This addendum supplements `docs/CRM_SITE_AUDIT_EXECUTION_PROGRESS_2026-07-10.md`.

## Status correction

The earlier backlog item `transaction-backed commands from backend inventory (#204)` is now resolved at source-contract level.

Implemented:

- `contracts/crm-v4-backend-command-contract-v1.json`;
- `docs/CRM_V4_BACKEND_COMMAND_CONTRACT_2026-07-10.md`;
- `tools/check_crm_v4_backend_command_contract.py`;
- `.github/workflows/crm-v4-backend-command-contract-check.yml`;
- validation in `.github/workflows/crm-site-full-audit-check.yml`.

The contract covers:

- `calculation.save`;
- `offer.create_from_calculation`;
- `offer.transition`;
- `order.create_from_offer`;
- `order.create_manual`;
- `order.transition`;
- `lead.transition`;
- `production_job.update`;
- `installation_job.update`.

For every command it fixes:

- canonical permission;
- transaction requirement;
- optimistic concurrency mode;
- request/result envelope;
- required payload fields;
- audit target and event key;
- dependent side effects.

## No duplicate status graph

`crm/v4/assets/v4/status-transitions-v1.js remains authoritative` for status domains, aliases, terminal flags, allowed targets, permissions, timestamps and transition audit events.

The backend command JSON contains only references to canonical domains and explicitly forbids a `transition_domains` section.

## Still open

Server implementation and integration proof remain open.

Required next work:

1. Generate a server-consumable representation from the command contract and canonical status registry.
2. Implement commands on a Supabase development branch.
3. Enforce active profile and canonical action server-side.
4. Add request idempotency and stale-version conflict checks.
5. Apply writes, dependent synchronization and audit transactionally.
6. Run positive and negative role tests.
7. Replace direct browser writes only after rollback evidence.
8. Obtain explicit approval before production deployment.

## Read-only evidence

Existing event/audit tables were verified without mutation:

- `leader_lead_events`;
- `leader_commercial_offer_events`;
- `leader_production_events`;
- `leader_installation_events`;
- `leader_activity_log`.

No live status value or historical row was rewritten.

## Approval boundary

No production Edge Function, RPC, RLS, grant or data was changed.

No DDL, DML, trigger, constraint, Auth or Storage change was made.

No `nav_*` object was touched.
