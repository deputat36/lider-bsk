# Codex operating status — 2026-06-28

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Status issue: #15.
Supabase baseline: `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`.
Request page post-merge snapshot: `docs/REQUEST_PAGE_POSTMERGE_STATUS_2026-06-28.md`.

## Current autonomous mode

- Default request: `@GitHub @Supabase продолжай, действуй автономно`.
- GitHub safe writes are allowed for docs, workflows, frontend guardrails and status snapshots.
- Supabase только read-only unless the owner explicitly approves production changes.
- Supabase production changes require explicit approval before DDL, DML, Edge Function deploys, broad RLS changes, grants/policies changes or data changes.
- Use `leader_*` for RA Lider work.
- `nav_*` is out of scope for RA Lider unless explicitly requested.
- Do not assert CI green when GitHub connector returns empty `statuses` / `workflow_runs`.

## Repository checkpoint

- Open PRs: none at this checkpoint.
- PR #74 was merged into `main` by squash as `ddcd5db60cb7c1e716021008c201883275132853`.
- `request.html` clarity update is now on `main` and guarded by `public-site-audit-check.yml`.
- PR #13 remains closed without merge and is archival context only.
- The active source of truth is `main`.
- CRM access docs and guardrails are expected on `main`, not on the old `crm-hardening-main-20260626` branch.
- RA Lider Supabase production baseline is documented in `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`.

## Manual owner check

Public request page:

`https://www.lider-bsk.ru/request.html`

Expected result:

- first screen shows the form and `Что будет дальше`;
- the page has `Перед отправкой` and `После отправки` sections;
- after a test submission, the form shows `Номер обращения`.

Use the direct CRM access route:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

Expected result after Ctrl+F5 and login as owner/admin:

- the `Доступ` section opens;
- invite controls are visible;
- user/profile management uses the owner/admin invite model;
- a user without invite remains pending/inactive.

## Supabase read-only baseline to verify during this pass

- `leader-public-lead` must remain ACTIVE v9 with `verify_jwt=false`.
- `leader-crm-leads` must remain ACTIVE v12 with `verify_jwt=true`.
- `leader-crm-orders` must remain ACTIVE v2 with `verify_jwt=true`.
- `leader_user_profiles` and `leader_user_invites` must have RLS enabled.
- Authenticated table grants for those access tables should remain limited to `SELECT`, `INSERT`, `UPDATE`.
- Public/authenticated/anon exposed `public.leader_%` SECURITY DEFINER execute count should remain `0`.

## Reporting rule

Every autonomous pass should end with:

- GitHub files changed and commit SHAs;
- Supabase read-only verification result;
- CI/check visibility limitations;
- exact browser check for the owner;
- note that Supabase production was not changed unless explicit approval was given.
