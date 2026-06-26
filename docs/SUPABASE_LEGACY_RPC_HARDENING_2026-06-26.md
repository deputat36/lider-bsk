# Supabase legacy RPC hardening, 2026-06-26

## Scope

This note records the next Supabase security hardening step for project `ofewxuqfjhamgerwzull`.

The work targeted SECURITY DEFINER functions that were still executable by the `authenticated` role but were not current browser-facing RPC entrypoints.

## Edge Function update before REVOKE

`leader-crm-leads` was deployed from the GitHub `main` implementation before revoking `leader_ensure_profile(text)`.

Result:

- function: `leader-crm-leads`;
- active version after deploy: `11`;
- `verify_jwt`: `true`;
- SHA: `46e8fd3decc8c08ac85dd47e31a977e7a6eb3ff85b27230b695f4f81d3a930f0`.

Reason: the previous active version `10` called `/rest/v1/rpc/leader_ensure_profile`. Version `11` prepares the profile directly through service-role REST after validating the user JWT, so the public RPC does not need to remain executable by `authenticated`.

## Migration applied

Migration recorded in Supabase:

- version: `20260626204149`;
- name: `revoke_authenticated_legacy_wizard_rework_profile_rpcs_20260626`.

SQL effect:

```sql
revoke execute on function public.leader_ensure_profile(text) from authenticated;
revoke execute on function public.nav_save_wizard_deal(jsonb) from authenticated;
revoke execute on function public.nav_v2_save_wizard_result(jsonb) from authenticated;
revoke execute on function public.nav_v2_submit_spn_rework(uuid, text) from authenticated;
revoke execute on function public.nav_v2_return_spn_rework(uuid, text) from authenticated;
revoke execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) from authenticated;
revoke execute on function public.nav_v2_get_deal_responsibility_snapshot(uuid) from authenticated;
revoke execute on function public.nav_v2_get_my_profile() from authenticated;
```

## Pre-checks

Before applying DDL:

- GitHub code search found no current client calls for the navigator wizard/rework/review/snapshot RPC set.
- `leader_ensure_profile` was only still needed by the old active Edge Function version and was removed from that path by deploying `leader-crm-leads` v11.
- No target RPC appeared in `pg_policies` expressions.
- No other `public` function referenced these target RPC names.

## Verification

Post-migration ACL check confirmed all target functions have no `authenticated` EXECUTE privilege:

- `leader_ensure_profile(user_email text)`;
- `nav_save_wizard_deal(p_result jsonb)`;
- `nav_v2_save_wizard_result(p_result jsonb)`;
- `nav_v2_submit_spn_rework(p_deal_id uuid, p_body text)`;
- `nav_v2_return_spn_rework(p_deal_id uuid, p_body text)`;
- `nav_v2_add_deal_review(p_deal_id uuid, p_decision text, p_body text, p_blocks_deposit boolean, p_blocks_deal boolean)`;
- `nav_v2_get_deal_responsibility_snapshot(p_deal_id uuid)`;
- `nav_v2_get_my_profile()`.

Aggregate count after migration:

- SECURITY DEFINER functions in `public`: `64`;
- still executable by `authenticated`: `17`;
- not executable by `authenticated`: `47`.

Previous count was `25` executable by `authenticated`, so this step removed 8 additional externally callable SECURITY DEFINER endpoints.

## Remaining advisor warnings

Security advisor still reports `authenticated_security_definer_function_executable` for 17 functions.

These are intentionally not changed in this step because they are either:

- access helper functions used by existing RLS policies; or
- active browser-facing RPCs used by Navigator v2, such as deal card, comments, and status updates.

Access-helper policy dependencies are documented separately in `docs/SUPABASE_ACCESS_HELPER_POLICY_DEPENDENCIES_2026-06-26.md`.

The remaining non-RPC advisor warning is Auth leaked password protection disabled. That setting is outside SQL migration scope and should be changed in Supabase Auth settings if the project policy allows it.

## Data impact

No tables, rows, RLS policies, storage buckets, Auth users, or CRM data were changed.
