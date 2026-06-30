# CRM server role matrix plan — 2026-06-30

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: CRM РА «Лидер», Edge Functions `leader-crm-leads` and `leader-crm-orders`.

## Purpose

The CRM already separates user roles in the UI. The next security step is to enforce the same business model server-side inside the CRM Edge Functions.

The browser must never be the only place where role permissions are enforced.

## Current safe baseline

Current CRM Edge Functions require:

1. JWT from Supabase Auth.
2. Existing user from `/auth/v1/user`.
3. Active row in `leader_user_profiles`.

This is a good baseline, but the next stage should verify the exact action against the exact role.

## Roles

| Role | Label | General purpose |
| --- | --- | --- |
| `owner` | Владелец | Full CRM ownership and administration. |
| `admin` | Администратор | Operational administration and access management. |
| `manager` | Менеджер | Leads, clients, calculations, offers, orders. |
| `designer` | Дизайнер | Layout/design tasks and design comments. |
| `production` | Производство | Production jobs and production comments/statuses. |
| `installer` | Монтажник | Installation jobs and installation comments/statuses. |

## Proposed Edge Function action matrix

### `leader-crm-leads`

| Action | owner | admin | manager | designer | production | installer | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ensure_profile` | yes | yes | yes | yes | yes | yes | May create pending profile after JWT check. No active CRM access should be granted without invite/admin action. |
| `dashboard` | yes | yes | yes | limited | limited | limited | Later can split dashboard by role. |
| `list` | yes | yes | yes | no | no | no | Full lead list should be CRM office/manager scope. |
| `list_orders` | yes | yes | yes | limited | limited | limited | Should eventually return role-filtered orders/jobs. |
| `create` | yes | yes | yes | no | no | no | Manual lead creation. |
| `update` | yes | yes | yes | no | no | no | Lead status/quality/client follow-up fields. |
| `ensure_client` | yes | yes | yes | no | no | no | Client creation/lookup. |
| `create_order` | yes | yes | yes | no | no | no | Creates order from calculation/manual payload. |
| `create_order_from_offer` | yes | yes | yes | no | no | no | Must remain atomic through `leader_create_order_from_offer_rpc`. |

### `leader-crm-orders`

| Action | owner | admin | manager | designer | production | installer | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `list` | yes | yes | yes | limited | limited | limited | Later should filter by assigned/related work. |
| `update.status` | yes | yes | yes | no | limited | limited | Production/installer should not arbitrarily close financial/order states. |
| `update.payment_status` | yes | yes | manager-limited | no | no | no | Finance-sensitive. |
| `update.layout_status` | yes | yes | yes | yes | no | no | Designer can update layout state. |
| `update.production_status` | yes | yes | yes | no | yes | no | Production can update production state. |
| `update.layout_comment` | yes | yes | yes | yes | yes-read/comment-limited | no | Define exact write model before implementation. |
| `update.deadline` | yes | yes | yes | no | limited | limited | Deadline changes should be logged. |

## Implementation sketch

Add helper functions inside each Edge Function source:

```ts
const ROLE_PERMISSIONS: Record<string, Set<string>> = {
  owner: new Set(['*']),
  admin: new Set(['*']),
  manager: new Set([
    'dashboard',
    'list',
    'list_orders',
    'create',
    'update',
    'ensure_client',
    'create_order',
    'create_order_from_offer',
  ]),
  designer: new Set([
    'dashboard:limited',
    'orders:list:limited',
    'orders:update_layout',
  ]),
  production: new Set([
    'dashboard:limited',
    'orders:list:limited',
    'orders:update_production',
  ]),
  installer: new Set([
    'dashboard:limited',
    'orders:list:limited',
    'orders:update_installation',
  ]),
};

function can(profile: { role?: string }, action: string) {
  const role = String(profile?.role || '').toLowerCase();
  const permissions = ROLE_PERMISSIONS[role];
  return Boolean(permissions?.has('*') || permissions?.has(action));
}
```

Then enforce after profile check and before action execution:

```ts
if (!can(checked.profile, action)) {
  return json(403, { error: 'forbidden', action });
}
```

For `leader-crm-orders`, map field-specific updates to permission names before applying the patch.

## Required safeguards

Before deployment to Supabase production:

1. Source for `leader-crm-leads` and `leader-crm-orders` must be stored in GitHub.
2. Static check must verify role matrix markers.
3. Manual browser check must pass for owner/admin and manager.
4. Negative check must pass for designer/production/installer restricted actions.
5. Edge Function deploy must be explicitly approved by owner.
6. Rollback path must be documented.

## Not implemented in this PR

This document does not change Supabase production.

It is a planning artifact for the next implementation PR after Edge Function source synchronization and explicit owner approval for deployment.
