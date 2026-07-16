# CRM orders generic endpoint restriction — 2026-07-16

Scope: GitHub source candidate `supabase/functions/leader-crm-orders/index.ts` only.

Related: #202, #204.

## Purpose

The generic orders endpoint returns broad order data and uses a service-role request. Designer, installer and contractor should work through job-specific design, production and installation tables/endpoints with smaller projections.

The previous source candidate still allowed:

- designer: generic list plus layout updates;
- installer: generic list.

Contractor was already denied because it had no matrix entry.

## Source result

`ORDER_ACTIONS_BY_ROLE` now contains only:

- owner;
- admin;
- manager.

The canonical role registry still contains all seven CRM roles. Therefore designer, installer and contractor are recognized roles but receive no permission through this generic endpoint and fail closed with `403 forbidden` before any order read or write.

Manager keeps the explicit non-finance field whitelist introduced in #345. Owner/admin wildcard behavior is unchanged.

## Read-only evidence

The returned production Edge logs for the previous 24-hour window contained no calls to `leader-crm-orders`. This package does not change a currently observed live caller path.

## Deliberately not included

- job-specific design/production/installation endpoint changes;
- role-specific generic list projections;
- accountant finance projection;
- browser UI changes;
- staging role tests;
- production deployment.

## Production boundary

- production `leader-crm-orders` remains ACTIVE v2;
- production `leader-crm-leads` remains ACTIVE v12;
- no Edge Function is deployed;
- no SQL, DDL or DML is executed;
- RLS, Auth, grants, policies and data are unchanged;
- `nav_*`, `nav_v2_*`, Parket and Broker are not touched.
