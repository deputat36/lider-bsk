# Supabase RA Lider baseline — 2026-06-28

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: RA Lider objects only, primarily `leader_*`.

This is a read-only production snapshot. No Supabase DDL, DML, Edge Function deploy, RLS, grants, policies or data changes were made while creating this document.

## Edge Functions

RA Lider Edge Functions observed in production:

- `leader-public-lead`: `ACTIVE`, version `9`, `verify_jwt=false`, deployed SHA `7ec30b7d3072848d7f7639587996f2c8cbc65d0472130df3044fe83726d95bda`.
- `leader-crm-leads`: `ACTIVE`, version `12`, `verify_jwt=true`, deployed SHA `8e52be7e6efec42d58d7dd60e1082b312d309b612e7305e595d9f6469b942fb9`.
- `leader-crm-orders`: `ACTIVE`, version `2`, `verify_jwt=true`, deployed SHA `2ee4e7cc60bd779d29b5afe45501c503f0c327ac2bab9edb2060b469508f76b3`.

Non-RA-Lider functions such as `nav_*` and `parket-*` are out of scope for this baseline.

## CRM access profile counts

Grouped production result from `public.leader_user_profiles`:

- active `owner`: `2`;
- active `admin`: `1`;
- active `manager`: `1`;
- no inactive group appeared in the grouped result.

## Access tables

Production grants and RLS for access tables:

- `leader_user_profiles`: RLS enabled.
- `leader_user_invites`: RLS enabled.
- Exposed grants for `authenticated` on both tables are limited to `SELECT`, `INSERT`, `UPDATE`.
- No `anon` or `public` grants appeared in the targeted access-table query.

## Access triggers

Expected enabled triggers:

- `leader_user_invites_normalize_trg` on `leader_user_invites`.
- `leader_apply_profile_invite_trg` on `leader_user_profiles`.
- `trg_leader_guard_user_profile_security` on `leader_user_profiles`.

## SECURITY DEFINER execute baseline

Public exposed `public.leader_%` SECURITY DEFINER execute count for `anon`, `authenticated`, `public`: `0`.

Exact execute grantees for key RA Lider RPCs:

- `leader_apply_profile_invite`: `{postgres,service_role}`.
- `leader_create_order_from_offer_rpc`: `{postgres,service_role}`.
- `leader_ensure_profile`: `{postgres,service_role}`.

## Expected access model

- Owner/admin creates invite in CRM tab `Доступ`.
- A user without invite remains pending/inactive.
- Browser CRM uses JWT-backed Edge Functions.
- Service-role-only RPC execution is kept behind Edge Functions and database triggers.

## Manual browser check

Use:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

After Ctrl+F5 and login as owner/admin:

- `Доступ` should open;
- invite controls should be visible;
- users without invite should not become active automatically.
