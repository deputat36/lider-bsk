# Supabase legacy RPC hardening, 2026-06-26

## Scope

This note records Supabase security hardening steps for project `ofewxuqfjhamgerwzull`.

The work targeted SECURITY DEFINER functions that were still executable by the `authenticated` role but were not current browser-facing RPC entrypoints.

## Edge Function update before REVOKE

`leader-crm-leads` was deployed from the GitHub `main` implementation before revoking `leader_ensure_profile(text)`.

Result:

- function: `leader-crm-leads`;
- active version after deploy: `11`;
- `verify_jwt`: `true`;
- SHA: `46e8fd3decc8c08ac85dd47e31a977e7a6eb3ff85b27230b695f4f81d3a930f0`.

Reason: the previous active version `10` called `/rest/v1/rpc/leader_ensure_profile`. Version `11` prepares the profile directly through service-role REST after validating the user JWT, so the public RPC does not need to remain executable by `authenticated`.

## Migrations applied

Two Supabase migrations are recorded for this stage.

### `20260626204149`

Name:

`revoke_authenticated_legacy_wizard_rework_profile_rpcs_20260626`

Repository file:

`supabase/migrations/20260626204149_revoke_authenticated_legacy_wizard_rework_profile_rpcs_20260626.sql`

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

### `20260626204925`

Name:

`revoke_authenticated_orphan_security_definer_helpers_20260626`

Repository file:

`supabase/migrations/20260626204925_revoke_authenticated_orphan_security_definer_helpers_20260626.sql`

SQL effect:

```sql
revoke execute on function public.leader_ensure_profile(text) from authenticated;
revoke execute on function public.nav_is_management() from authenticated;
revoke execute on function public.nav_user_role_of(uuid) from authenticated;
```

The second migration is intentionally narrow. A follow-up ACL audit still showed an explicit `authenticated` grant for `leader_ensure_profile(text)`, so it was revoked again together with two legacy helper functions that had no RLS policy references, no public-function references, and no current runtime calls in GitHub code search.

## Pre-checks

Before applying DDL:

- GitHub code search found no current client calls for the navigator wizard/rework/review/snapshot RPC set.
- `leader_ensure_profile` was only needed by the old active Edge Function version and was removed from that path by deploying `leader-crm-leads` v11.
- No target RPC appeared in `pg_policies` expressions before its REVOKE step.
- `nav_is_management()` and `nav_user_role_of(uuid)` had no `pg_policies` references and no `public` function references.

## Verification

Post-migration ACL checks confirmed these functions no longer have `authenticated` EXECUTE privilege:

- `leader_ensure_profile(user_email text)`;
- `nav_save_wizard_deal(p_result jsonb)`;
- `nav_v2_save_wizard_result(p_result jsonb)`;
- `nav_v2_submit_spn_rework(p_deal_id uuid, p_body text)`;
- `nav_v2_return_spn_rework(p_deal_id uuid, p_body text)`;
- `nav_v2_add_deal_review(p_deal_id uuid, p_decision text, p_body text, p_blocks_deposit boolean, p_blocks_deal boolean)`;
- `nav_v2_get_deal_responsibility_snapshot(p_deal_id uuid)`;
- `nav_v2_get_my_profile()`;
- `nav_is_management()`;
- `nav_user_role_of(p_uid uuid)`.

Aggregate count after the second migration:

- SECURITY DEFINER functions in `public`: `64`;
- still executable by `authenticated`: `15`;
- not executable by `authenticated`: `49`.

This stage removed 10 externally callable SECURITY DEFINER endpoints from the `authenticated` role.

## Remaining advisor warnings

Security advisor still reports `authenticated_security_definer_function_executable` for 15 functions.

These are intentionally not changed in this step because they are either:

- access helper functions used by existing RLS policies; or
- active browser-facing RPCs used by Navigator v2, such as deal card, comments, and status updates.

Access-helper policy dependencies are documented separately in `docs/SUPABASE_ACCESS_HELPER_POLICY_DEPENDENCIES_2026-06-26.md`.

The remaining non-RPC advisor warning is Auth leaked password protection disabled. That setting is outside SQL migration scope and should be changed in Supabase Auth settings if the project policy allows it.

## Data impact

No tables, rows, RLS policies, storage buckets, Auth users, or CRM data were changed.
