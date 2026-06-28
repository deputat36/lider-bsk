# Codex operating status — 2026-06-28

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Status issue: #15.
Supabase baseline: `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`.
Supabase advisor interpretation: `docs/SUPABASE_RA_LIDER_ADVISORS_2026-06-28.md`.
Owner decision rules: `docs/OWNER_DECISIONS_2026-06-28.md`.
Request page post-merge snapshot: `docs/REQUEST_PAGE_POSTMERGE_STATUS_2026-06-28.md`.
CRM access runbook: `docs/CRM_ACCESS_TAB_CHECK_2026-06-27.md`.

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
- The active source of truth is `main`.
- PR #75 was merged into `main` by squash as `6bcc3a9220c16754abecc969ede88f19c2ae2514`.
- PR #77 was merged into `main` by squash as `f94d4c79d40c116daf7958027507340983ee9e01`.
- PR #79 was merged into `main` by squash as `712f9860641ef5c64b2d1ef6d4d1b6eb32878d58`.
- PR #80 was merged into `main` by squash as `0c1f2ec6809ed904c2352563b9d90d403a106a14`.
- PR #85 was merged into `main` by squash as `80c182d696d2eaeb28e720f41794d54436008e05`.
- PR #86 was merged into `main` by squash as `80abda38461ac99e9cf83a7064276b086a23a8af`.
- PR #75 fixed public header navigation overlap around `1025–1180px`.
- PR #77 removed the temporary public header feature branch from permanent workflow triggers.
- PR #79 and PR #80 normalized GitHub Actions push branch filters to permanent `main` targets.
- PR #85 updated operating guardrails and owner-decision CI markers.
- PR #86 bumped CRM access admin cache markers to `20260628-access-label-1`.
- PR #13 remains closed without merge and is archival context only.
- CRM access docs and guardrails are expected on `main`, not on old feature/date branches.
- RA Lider Supabase production baseline is documented in `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`.

## Current CRM access cache markers

The current CRM access label/cache marker is `20260628-access-label-1`.

Expected repository markers:

- `crm/v4/index.html` loads `assets/v4/auth.js?v=20260628-access-label-1`.
- `crm/v4/assets/v4/auth.js` imports `./user-admin-v1.js?v=20260628-access-label-1`.
- `crm/v4/index.html` loads `assets/v4/crm-v4-expanded-menu-v1.js?v=20260628-access-label-1`.
- The access label should be `Доступ и роли`.

## Supabase production rule

Autonomous work may read Supabase project status, Edge Function metadata, logs and advisors.

Autonomous work must not perform these actions without explicit owner approval:

- DDL or migrations;
- DML or production data edits;
- Edge Function deploys;
- RLS policy rewrites;
- grants or revoke statements;
- Auth setting changes;
- index drops or rewrites.

Use the exact approval wording from `docs/OWNER_DECISIONS_2026-06-28.md` before any production Supabase mutation.

## Manual owner checks

Public request page:

`https://www.lider-bsk.ru/request.html`

Expected result:

- first screen shows the form and `Что будет дальше`;
- the page has `Перед отправкой` and `После отправки` sections;
- after a test submission, the form shows `Номер обращения`.

Public header navigation:

- check the main site around `1025–1180px` viewport width;
- menu items must not overlap the phone or CTA button;
- at `<=1024px`, the mobile menu button should remain active.

CRM access route:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

Expected result after Ctrl+F5 and login as owner/admin:

- the `Доступ и роли` section opens;
- loaded HTML/source contains `20260628-access-label-1`;
- invite controls are visible;
- user/profile management uses the owner/admin invite model;
- a user without invite remains pending/inactive.

## Supabase read-only baseline to verify during autonomous passes

- Project `ofewxuqfjhamgerwzull` should remain `ACTIVE_HEALTHY`.
- `leader-public-lead` must remain ACTIVE v9 with `verify_jwt=false`.
- `leader-crm-leads` must remain ACTIVE v12 with `verify_jwt=true`.
- `leader-crm-orders` must remain ACTIVE v2 with `verify_jwt=true`.
- `leader_user_profiles` and `leader_user_invites` must have RLS enabled.
- Authenticated table grants for those access tables should remain limited to `SELECT`, `INSERT`, `UPDATE`.
- Public/authenticated/anon exposed `public.leader_%` SECURITY DEFINER execute count should remain `0`.
- `nav_*` / `nav_v2_*` advisor warnings are not RA Lider scope unless explicitly requested.
- Auth leaked-password protection is an owner-level Supabase Auth decision.

## Reporting rule

Every autonomous pass should end with:

- GitHub files changed and commit SHAs;
- Supabase read-only verification result;
- CI/check visibility limitations;
- exact browser check for the owner;
- note that Supabase production was not changed unless explicit approval was given.
