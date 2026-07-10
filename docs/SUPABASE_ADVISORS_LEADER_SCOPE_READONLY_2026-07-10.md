# Supabase advisors — RA Lider scoped read-only snapshot — 2026-07-10

Project: `ofewxuqfjhamgerwzull`.

Scope: only `leader_*` objects belonging to RA Lider, plus one global Auth setting that affects all applications in the Supabase project.

Mode: read-only advisor and SQL inspection. No Supabase production changes were made.

Related issue: #15.

## Security advisors

The current Supabase security advisor returned many warnings for `nav_*` SECURITY DEFINER functions. Those objects belong to another project and are out of scope for RA Lider.

No security-advisor warning identified an exposed `leader_*` SECURITY DEFINER function.

A separate read-only SQL privilege check confirmed eight `leader_*` SECURITY DEFINER functions, all with `authenticated_can_execute = false`:

| Function | Arguments | Authenticated execute |
|---|---|---|
| `leader_apply_profile_invite` | — | false |
| `leader_create_order_from_offer_rpc` | `p_payload jsonb` | false |
| `leader_create_order_rpc` | `p_payload jsonb` | false |
| `leader_ensure_profile` | `user_email text` | false |
| `leader_get_leads_for_crm` | — | false |
| `leader_guard_user_profile_security` | — | false |
| `leader_log` | `action_text text, entity_text text, entity_id_text text, payload jsonb` | false |
| `leader_my_role` | — | false |

Conclusion: the inspected RA Lider SECURITY DEFINER functions are not directly executable by the `authenticated` role.

## Global Auth warning

Supabase reports `Leaked Password Protection Disabled`.

This is a project-wide Auth setting, not a `leader_*` database object. Enabling it would affect all applications sharing this Supabase project and therefore requires explicit approval and cross-project impact review.

Remediation reference:

`https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection`

## Performance advisors

The relevant RA Lider findings are informational `unused_index` notices.

Read-only `pg_stat_user_indexes` inspection of non-primary, non-unique `leader_*` indexes with `idx_scan = 0` found:

- unused noncritical index count: 78;
- total size: 1,073,152 bytes, approximately 1,048 kB;
- largest individual index: 16 kB.

These values indicate a small and still lightly used database. `idx_scan = 0` is not enough evidence to remove an index, especially while CRM modules and query patterns are still evolving.

No index should be dropped autonomously.

Remediation reference:

`https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index`

## Decision

For RA Lider:

1. Keep all current indexes.
2. Re-check advisor and index usage after meaningful production traffic accumulates.
3. Before considering an index drop, inspect real query patterns, index dependencies, constraints and at least several weeks of stable usage statistics.
4. Do not act on `nav_*`, generic tables or unrelated applications from this project context.
5. Treat the global leaked-password warning as a separate cross-project decision.

## Guardrails

- No DDL was executed.
- No DML was executed.
- No index was created, dropped or renamed.
- No function grants were changed.
- No Auth setting was changed.
- No RLS policy or grant was changed.
- No Edge Function was deployed.
- No `nav_*` object was modified.
