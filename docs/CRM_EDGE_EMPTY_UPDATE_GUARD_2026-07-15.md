# CRM Edge empty update guard — 2026-07-15

Scope: GitHub source snapshots for `leader-crm-leads` and `leader-crm-orders`.

Related: #202, #204 and draft PR #229.

## Problem

Both service-role Edge Function sources accepted an `update` action with a valid row ID but without any supported update fields. The functions then constructed an empty object and could issue a service-role `PATCH` with `{}`.

An empty update is not a valid business operation. It should fail before any request to a business table.

## Source-only change

The following guard is now required inside both update handlers after the supported fields are copied into `patch` and before the service-role REST call:

```ts
if (!Object.keys(patch).length) return json(400, { error: 'no_update_fields' })
```

Covered handlers:

- `updateLead(...)` in `supabase/functions/leader-crm-leads/index.ts`;
- `updateOrder(...)` in `supabase/functions/leader-crm-orders/index.ts`.

## Expected behavior

- missing row ID still returns `400 id_required`;
- an update containing at least one supported field keeps the existing source behavior;
- an update containing no supported fields returns `400 no_update_fields`;
- no service-role REST `PATCH` is reached for an empty update;
- unknown actions continue to return `400 unknown_action`.

Unknown input fields are not copied into the PATCH payload. This guard does not add any new writable fields or permissions.

## Automated contract

`tools/check_crm_edge_empty_update_guard.py` verifies for both source files:

- exactly one `no_update_fields` guard exists;
- the guard is inside the correct update handler;
- the guard appears after the last supported patch assignment;
- the guard appears before the service-role REST call;
- the existing `id_required` and `unknown_action` failures remain present;
- this document and the RBAC workflow stay connected.

The checker runs from `.github/workflows/crm-server-action-rbac-check.yml`.

## Deployment boundary

This is a GitHub source-only hardening step.

Observed read-only production state on 2026-07-15:

- Supabase project `ofewxuqfjhamgerwzull`: `ACTIVE_HEALTHY`;
- `leader-crm-leads`: ACTIVE v12, JWT-protected;
- `leader-crm-orders`: ACTIVE v2, JWT-protected.

No Edge Function was deployed. No SQL, DDL, DML, RLS, Auth, grants, policies or business data were changed.

The full role/action matrix, role-specific projections and development-branch integration tests remain separate approval-gated work. This focused guard must not be described as completion of server-side RBAC.
