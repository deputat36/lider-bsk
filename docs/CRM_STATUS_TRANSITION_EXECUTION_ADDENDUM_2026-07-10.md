# CRM status transition execution addendum — 2026-07-10

Related: #200, #202, #204, #214, #217.

This addendum supplements `docs/CRM_SITE_AUDIT_EXECUTION_PROGRESS_2026-07-10.md`.

## Status correction

The backlog line `centralized status registry` in the earlier execution snapshot is now resolved in GitHub source.

Implemented:

- `crm/v4/assets/v4/status-transitions-v1.js`;
- `docs/CRM_STATUS_TRANSITION_REGISTRY_2026-07-10.md`;
- `tools/check_crm_status_transition_registry.py`;
- `tools/test_crm_status_transitions.mjs`;
- `.github/workflows/crm-status-transition-registry-check.yml`;
- status registry validation in `.github/workflows/crm-site-full-audit-check.yml`.

Registry domains:

- leads;
- commercial offers;
- orders;
- layout;
- production;
- installation;
- order payment state;
- payment records;
- design tasks;
- future order documents.

Each status defines:

- canonical key;
- Russian label;
- aliases;
- terminal flag;
- allowed targets;
- permission;
- timestamp field;
- audit event.

## Read-only production evidence

Distinct production values were read without DML for:

- `leader_leads.status`;
- `leader_commercial_offers.status`;
- `leader_orders.status`;
- `leader_orders.payment_status`;
- `leader_orders.layout_status`;
- `leader_orders.production_status`;
- `leader_orders.installation_status`;
- `leader_design_tasks.task_status`;
- `leader_production_jobs.production_status`;
- `leader_production_jobs.layout_status`;
- `leader_payments.payment_status`.

The registry includes all values currently observed in non-empty production domains, including NULL installation state normalization.

## Still open

The following work remains open and must not be confused with registry creation:

1. Replace duplicated UI status arrays one module at a time.
2. Show/log unknown raw values without rewriting them.
3. Use registry validation in future Edge/RPC transition commands.
4. Check canonical action permission server-side.
5. Apply status, timestamp and audit event transactionally.
6. Add negative tests for forbidden and stale transitions.
7. Decide separately whether any database constraints are appropriate.

## Approval boundary

No production status rows were changed.

No enum, constraint, trigger, RLS policy, grant, Edge Function or RPC was changed.

No `nav_*` object was touched.

Server-side transition enforcement remains tracked in #202 and #204.
