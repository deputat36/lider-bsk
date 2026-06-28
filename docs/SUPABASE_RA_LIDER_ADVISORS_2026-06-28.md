# Supabase RA Lider advisors — 2026-06-28

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: read-only advisor interpretation for RA Lider `leader_*` objects.

No Supabase DDL, DML, Edge Function deploy, RLS, grants, policies, indexes or data changes were made while creating this document.

## Security advisor interpretation

The Supabase security advisor was checked read-only.

Observed security advisor categories:

- `authenticated_security_definer_function_executable` warnings in the visible advisor output are for `nav_*` / `nav_v2_*` functions.
- `auth_leaked_password_protection` is enabled as an advisor warning because leaked password protection is disabled at Supabase Auth level.
- These advisor warnings are project-wide and are not the same as an RA Lider `leader_*` regression.

RA Lider-specific verification was performed with SQL because advisor output can be long and connector output may be truncated:

- Public exposed `public.leader_%` SECURITY DEFINER execute count for `anon`, `authenticated`, `public`: `0`.
- `leader_apply_profile_invite`: execute grantees `{postgres,service_role}`.
- `leader_create_order_from_offer_rpc`: execute grantees `{postgres,service_role}`.
- `leader_ensure_profile`: execute grantees `{postgres,service_role}`.

Conclusion for this checkpoint:

- No RA Lider `leader_*` SECURITY DEFINER function is exposed to `anon`, `authenticated` or `public`.
- `nav_*` / `nav_v2_*` warnings are outside RA Lider scope unless explicitly requested.
- Auth leaked-password protection is a project-level setting; enabling it requires owner decision, not an autonomous RA Lider code change.

## Performance advisor interpretation

The performance advisor was checked read-only.

Observed project-wide categories include:

- `unindexed_foreign_keys` for non-RA-Lider tables such as `deal_*` / `orders` / `order_items`.
- `auth_rls_initplan` for non-RA-Lider legacy tables such as `catalog`, `clients`, `projects`, `orders`.
- `multiple_permissive_policies` for `nav_*` tables.
- `unused_index` notices across several project areas, including RA Lider.

Visible RA Lider `unused_index` notices observed in the advisor output:

- `leader_leads_created_at_idx` on `leader_leads`.
- `leader_orders_deadline_idx` on `leader_orders`.
- `leader_commercial_offers_created_at_idx` on `leader_commercial_offers`.
- `leader_production_jobs_deadline_idx` on `leader_production_jobs`.
- `leader_installation_jobs_scheduled_at_idx` on `leader_installation_jobs`.
- `leader_lead_calculations_created_at_idx` on `leader_lead_calculations`.
- `leader_expenses_contractor_id_idx` on `leader_expenses`.
- `leader_catalog_sort_name_idx` on `leader_catalog`.
- `leader_order_items_order_created_idx` on `leader_order_items`.
- `ix_leader_leads_phone_normalized_created_at` on `leader_leads`.
- `ix_leader_public_lead_audit_phone_created_at` on `leader_public_lead_audit`.
- `leader_user_invites_invited_by_idx` on `leader_user_invites`.
- `leader_user_invites_accepted_user_id_idx` on `leader_user_invites`.

Interpretation:

- These are `INFO` performance notices, not security failures.
- Do not drop these indexes autonomously. Unused-index advisors can be misleading on low-traffic or newly created paths.
- Any index removal or RLS policy rewrite is DDL and requires explicit owner approval plus rollback plan.

## Current RA Lider Edge Function baseline

- `leader-public-lead`: `ACTIVE`, version `9`, `verify_jwt=false`.
- `leader-crm-leads`: `ACTIVE`, version `12`, `verify_jwt=true`.
- `leader-crm-orders`: `ACTIVE`, version `2`, `verify_jwt=true`.

## Owner decisions required before changes

Ask before any of these actions:

- enabling leaked password protection;
- changing or revoking `nav_*` RPC grants;
- dropping any `leader_*` index;
- rewriting RLS policies for performance;
- changing Supabase Auth settings;
- deploying Edge Functions.

## Manual check

For the RA Lider CRM access path, use:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

After Ctrl+F5 and owner/admin login, confirm `Доступ` opens and invite controls are visible.
