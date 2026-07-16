# CRM orders generic endpoint restriction — 2026-07-16

Scope: GitHub source candidate `supabase/functions/leader-crm-orders/index.ts` only.

Related: #202, #204.

## Purpose

The generic orders endpoint uses service-role requests. Designer, installer and contractor should work through job-specific design, production and installation tables/endpoints with smaller projections.

The previous source candidate still allowed designer generic list/layout updates and installer generic list. Those paths remain removed.

## Source result

`ORDER_ACTIONS_BY_ROLE` contains:

- owner — wildcard;
- admin — wildcard;
- manager — list plus the established non-finance update whitelist;
- accountant — list plus only `update:payment_status`.

The canonical role registry still contains all seven CRM roles. Therefore designer, installer and contractor are recognized roles but receive no permission through this generic endpoint and fail closed with `403 forbidden` before any order read or write.

Accountant is not a production/job role. Its generic access is limited to finance work and a separate response projection without client phone, design, production or installation data.

Manager keeps the explicit non-finance field whitelist introduced in #345. Owner/admin wildcard behavior is unchanged.

## Role-specific responses

List and update responses use `ORDER_FIELDS_BY_ROLE`:

- manager receives client and operational fields without payment, cost, profit, prepayment or balance;
- accountant receives payment and financial totals without client contacts, internal comments or job data;
- owner/admin retain the existing administrative fields.

Projection selection and validation happen before service-role GET/PATCH.

## Deliberately not included

- job-specific design/production/installation endpoint changes;
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
