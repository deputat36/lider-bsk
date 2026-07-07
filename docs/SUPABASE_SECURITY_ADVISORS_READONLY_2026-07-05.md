# Supabase security advisors read-only check — 2026-07-05

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope for RA Lider work: `leader_*` objects and RA Lider Edge Functions only.

This document records a read-only Supabase security advisor check. No Supabase DDL, DML, Edge Function deploy, RLS, grants, policies or data changes were performed.

## Result summary

The security advisor check returned warnings in two groups:

1. SECURITY DEFINER functions executable by `authenticated` users.
2. Auth leaked password protection is disabled.

The SECURITY DEFINER warnings returned by this check are for `nav_*` / `nav_v2_*` functions. Those functions belong to the separate Navigator contour and are out of scope for RA Lider changes in this project context.

The RA Lider baseline still remains:

- `leader-public-lead`: `ACTIVE`, version `9`, `verify_jwt=false`.
- `leader-crm-leads`: `ACTIVE`, version `12`, `verify_jwt=true`.
- `leader-crm-orders`: `ACTIVE`, version `2`, `verify_jwt=true`.

## Handling notes

- Do not change `nav_*` or `nav_v2_*` objects while working on RA Lider public site / CRM tasks.
- Do not change Supabase Auth settings without explicit owner approval.
- Keep Supabase production read-only unless the owner explicitly approves a specific production change.
- If a future RA Lider security task is opened, verify only `leader_*` objects and document the exact read-only query or advisor result before proposing changes.

## Related local work

- Public site tasks: #142, #185, #191, #195.
- Supabase sync and baseline task: #15.
