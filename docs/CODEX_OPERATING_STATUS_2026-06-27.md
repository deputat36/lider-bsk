# Codex operating status — 2026-06-27

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Status issue: #15.

## Current mode

- Default owner instruction: `@GitHub @Supabase продолжай автономно`.
- GitHub writes are allowed for safe docs, frontend guardrails and workflows.
- Supabase только read-only unless the owner explicitly approves production changes.
- Supabase production changes require explicit owner approval before DDL, DML, Edge Function deploys, broad RLS changes or data changes.
- Use `leader_*` for RA Lider work.
- Treat `nav_*` as out of scope for RA Lider unless explicitly requested.
- Do not assert CI green when the GitHub connector returns empty `statuses` / `workflow_runs` for a push commit.

## Current repository state

- There are no open PRs for `deputat36/lider-bsk` at this checkpoint.
- PR #13 is closed without merge and must not be treated as the active merge candidate.
- The old branch `crm-hardening-main-20260626` is diverged from `main` and is archival context only.
- The current source of truth for CRM access docs and guards is `main`.

## Current CRM access checkpoint

- Main CRM: `https://deputat36.github.io/lider-bsk/crm/v4/`.
- Direct access tab URL: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`.
- Access tab runbook: `docs/CRM_ACCESS_TAB_CHECK_2026-06-27.md`.
- Owner/admin invite model is current: owner/admin creates invite in `Доступ`; a user without invite remains pending/inactive.

## Current live Supabase checkpoint

Read-only checks from 2026-06-27 show the RA Lider functions:

- `leader-public-lead v9`, `verify_jwt=false`;
- `leader-crm-leads v12`, `verify_jwt=true`;
- `leader-crm-orders v2`, `verify_jwt=true`.

The access model documented in `docs/STATUS.md` remains the expected baseline:

- `leader_user_profiles` and `leader_user_invites` have RLS enabled;
- exposed authenticated grants for those tables are limited to `SELECT`, `INSERT`, `UPDATE`;
- no public `leader_%` SECURITY DEFINER function should be callable by `anon`, `authenticated` or `public`.

## What Codex should do next

For autonomous passes:

1. Check open PRs first.
2. Prefer `main` unless an open PR or explicit branch is named.
3. Run Supabase read-only verification for access/auth/RLS/Edge Function tasks.
4. Patch docs/workflows when repository state changes.
5. Record meaningful project-state updates in issue #15.
6. Report commits, verification, manual browser checks and limits.
