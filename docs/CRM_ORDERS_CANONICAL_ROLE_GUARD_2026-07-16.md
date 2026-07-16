# CRM orders Edge canonical role guard — 2026-07-16

Scope: GitHub source candidate `supabase/functions/leader-crm-orders/index.ts` only.

Related: #202, #204, #229.

## Purpose

The previous source candidate contained an allow entry for role `production`. That role is not part of the canonical CRM v4 role registry and is absent from the current production profile data.

This change makes role handling fail closed before the source candidate reads `ORDER_ACTIONS_BY_ROLE`.

## Canonical roles

The source candidate now recognizes exactly:

- `owner`;
- `admin`;
- `manager`;
- `accountant`;
- `designer`;
- `installer`;
- `contractor`.

An empty, unknown or legacy role is denied before action permissions are read.

The non-canonical `production` matrix entry is removed.

## Read-only production evidence

Read-only query on project `ofewxuqfjhamgerwzull` on 2026-07-16 returned active profiles only for:

- `owner`: 2;
- `admin`: 1;
- `manager`: 1.

No `production` profile exists.

## Exact source contract

`canOrderAction()` must:

1. normalize the current profile role;
2. reject the role when it is not in `CANONICAL_ROLES`;
3. only then read `ORDER_ACTIONS_BY_ROLE[currentRole]`;
4. keep the existing fail-closed `403 forbidden` response.

## Deliberately not included

This is not the complete server-side RBAC implementation.

Still open in #202 and #229:

- remove generic orders access for restricted production roles;
- add a safe accountant projection before enabling accountant list access;
- prevent manager from changing `payment_status`;
- replace broad `update:any` with field-level canonical permissions;
- align all Edge actions with the browser action registry;
- run role-positive and role-negative tests in staging;
- obtain explicit approval before any production deployment.

## Production boundary

No Supabase deployment or database change is part of this package.

- production `leader-crm-orders` remains ACTIVE v2;
- production `leader-crm-leads` remains ACTIVE v12;
- no SQL, DDL or DML is executed;
- RLS, Auth, grants, policies and data are unchanged;
- `nav_*`, `nav_v2_*`, Parket and Broker are not touched.
