# Supabase migration history normalization — 2026-06-27

Project: `ofewxuqfjhamgerwzull`.
Repository: `deputat36/lider-bsk`.

## Current finding

Runtime Supabase state for CRM access is correct, but GitHub migration history is not yet normalized for `supabase db push` / preview-branch workflows.

The CRM sync SQL files that were added after production hardening are mostly manual snapshot files with names like:

- `20260626_01_leader_user_invites_table.sql`
- `20260626_02_leader_user_invites_policies.sql`
- `20260626_03_leader_user_invites_normalize.sql`
- `20260626_04_leader_apply_profile_invite.sql`
- `20260626_05_leader_ensure_profile_pending.sql`
- `20260626_06_leader_order_from_offer_rpc.sql`
- `20260626_07_leader_profile_function_grants.sql`
- `20260626_08_leader_order_rpc_restrict_execute.sql`
- `20260626_10_leader_user_invites_fk_indexes.sql`
- `20260627_01_leader_user_invites_restrict_authenticated_grants.sql`
- `20260627_02_leader_profiles_insert_pending_policy.sql`

Production Supabase migration history uses 14-digit versions. The relevant live rows are:

| Version | Name |
| --- | --- |
| `20260626113344` | `leader_crm_pending_user_invites` |
| `20260626175044` | `leader_create_order_from_offer_rpc` |
| `20260626183314` | `leader_crm_ensure_profile_execute_grant_20260626` |
| `20260626204149` | `revoke_authenticated_legacy_wizard_rework_profile_rpcs_20260626` |
| `20260626204441` | `leader_ensure_profile_authenticated_execute_restore_20260626` |
| `20260626204904` | `leader_user_invites_fk_indexes_20260626` |
| `20260626204925` | `revoke_authenticated_orphan_security_definer_helpers_20260626` |

This means GitHub contains the final intended SQL state, while production records a different historical sequence.

## Verified live CRM state

The following was verified directly in Supabase after the PR merge:

- `leader_user_invites` exists and has RLS enabled.
- `leader_user_profiles` has RLS enabled.
- `authenticated` has only `SELECT`, `INSERT`, `UPDATE` on `leader_user_invites` and `leader_user_profiles`.
- Invite policies use `leader_private.leader_is_admin()`.
- Profile self-insert policy allows only own pending manager profile with empty permissions.
- `leader_user_invites_normalize_trg` exists.
- `leader_apply_profile_invite_trg` exists.
- FK indexes exist:
  - `leader_user_invites_invited_by_idx`
  - `leader_user_invites_accepted_user_id_idx`
- No `public.leader_%` SECURITY DEFINER functions are executable by `anon`, `authenticated`, or `public`.
- `leader-crm-leads` is deployed as Edge Function version 12, `ACTIVE`, `verify_jwt=true`.

## Why not rename blindly

Do not simply rename `20260626_01...` files to production versions without reconstructing the full historical sequence.

Reasons:

1. Production has applied versions that do not have one-to-one GitHub files.
2. Some production versions temporarily granted access that later hardening removed.
3. Current GitHub SQL represents final desired state, not necessarily the exact production order.
4. A bad rename can make preview branches or `supabase db push` disagree with `supabase_migrations.schema_migrations`.

## Safe normalization path

Recommended path before relying on Supabase CLI migration deployment:

1. Create a local checkout with Supabase CLI available.
2. Pull production migration history and schema:
   - `supabase db pull crm_history_normalization --linked`
   - or use `supabase db dump` / `supabase db diff` depending on the selected workflow.
3. Reconstruct 14-digit migration files for every production version that is present in `supabase_migrations.schema_migrations` but missing from GitHub.
4. For historical migrations that are superseded by later hardening, either:
   - reproduce the historical SQL exactly if available, or
   - create a documented no-op migration only if the team accepts that local reset represents final state rather than exact historical transitions.
5. Move current manual snapshot files into normalized 14-digit files only after confirming local `supabase db reset` succeeds.
6. Run a local reset from an empty database.
7. Run advisors against the resulting database.
8. Compare local schema to production schema.
9. Only then delete the manual snapshot files.

## Current operational rule

Until normalization is complete:

- Treat the live Supabase project as source of truth for runtime CRM security.
- Treat GitHub SQL files as final-state snapshots for review and disaster recovery.
- Do not use `supabase db push` or preview branches as the primary DB deploy path for this CRM sync set without first resolving the migration-history mismatch.

## Runtime status

This is not a runtime blocker. The current production database and Edge Function state have been verified independently and match the CRM hardening model.
