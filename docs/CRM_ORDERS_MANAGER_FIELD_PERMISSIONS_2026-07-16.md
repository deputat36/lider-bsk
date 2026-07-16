# CRM orders manager field permissions — 2026-07-16

Scope: GitHub source candidate `supabase/functions/leader-crm-orders/index.ts` only.

Related: #202, #204, #229.

## Purpose

The previous candidate gave `manager` the synthetic permission `update:any`. Because `requestedUpdateFields()` includes `payment_status`, that shortcut allowed a manager request to pass the source-level authorization check for finance-owned data.

The browser action registry does not grant `finance.write` to manager. The Edge source candidate must not silently broaden that contract.

## Manager whitelist

Manager now receives only:

- `list`;
- `update:status`;
- `update:layout_status`;
- `update:production_status`;
- `update:layout_comment`;
- `update:deadline`.

Manager does not receive:

- `update:any`;
- `update:payment_status`;
- any other unknown update field.

Owner and admin continue to use the explicit wildcard `*`.

## Authorization order

`canUpdateOrder()` obtains the supported fields from `requestedUpdateFields()` and requires every field to pass `canOrderAction(profile, update:<field>)`.

A mixed request containing one allowed manager field and `payment_status` is denied before `updateOrder()` and before any service-role PATCH.

An update without supported fields still reaches the existing `400 no_update_fields` guard and never performs `PATCH {}`.

## Read-only production evidence

Edge logs checked on 2026-07-16 contained no requests to `leader-crm-orders` in the returned 24-hour window. Production continues to use direct CRM/RLS paths rather than this source candidate.

Production profiles currently contain active owner, admin and manager roles. The source change is therefore prepared for future staging verification but is not deployed.

## Deliberately not included

This is not complete order RBAC.

Still open:

- role-specific list projections;
- accountant finance projection and `payment_status` command;
- removal of generic order access for designer and installer;
- job-specific endpoints for designer, installer and contractor;
- staging positive/negative role tests;
- explicit approval before production deployment.

## Production boundary

- production `leader-crm-orders` remains ACTIVE v2;
- production `leader-crm-leads` remains ACTIVE v12;
- no Edge Function is deployed;
- no SQL, DDL or DML is executed;
- RLS, Auth, grants, policies and data are unchanged;
- `nav_*`, `nav_v2_*`, Parket and Broker are not touched.
