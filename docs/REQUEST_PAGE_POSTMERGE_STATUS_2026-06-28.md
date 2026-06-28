# Request page post-merge status — 2026-06-28

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.

## GitHub status

PR #74 `Improve public request page clarity` was merged into `main` by squash.

Merge commit:

`ddcd5db60cb7c1e716021008c201883275132853`

Merged changes:

- `request.html` now has a clearer first screen, visible form, and user-facing next-step copy.
- Added blocks: `Что будет дальше`, `Перед отправкой`, `После отправки`.
- Added clear copy for `Номер обращения` after submission.
- UX markers are guarded in `.github/workflows/public-site-audit-check.yml`.
- Detailed manual check is documented in `docs/REQUEST_PAGE_CLARITY_2026-06-28.md`.

Open PRs after the merge: none.

## Supabase status

No Supabase production changes were made for this page update.

Read-only verification after merge:

- `leader-public-lead` remains `ACTIVE`, version `9`, `verify_jwt=false`.
- `leader-crm-leads` remains `ACTIVE`, version `12`, `verify_jwt=true`.
- `leader-crm-orders` remains `ACTIVE`, version `2`, `verify_jwt=true`.
- `leader_leads_request_id_key` exists and protects `request_id` uniqueness.
- Public exposed `public.leader_%` SECURITY DEFINER execute count for `anon`, `authenticated`, `public`: `0`.

## Advisor status

Security advisor still reports project-wide warnings for `nav_*` / `nav_v2_*` SECURITY DEFINER functions and leaked password protection.

RA Lider interpretation remains unchanged:

- no `leader_*` SECURITY DEFINER regression was found;
- `nav_*` is outside RA Lider scope unless explicitly requested;
- enabling leaked password protection is a project-level owner decision.

Performance advisor still includes `INFO` unused-index notices for some `leader_*` indexes. Do not drop indexes autonomously; this requires owner approval, traffic context, and rollback plan.

## Owner browser check

Public request page:

`https://www.lider-bsk.ru/request.html`

Check:

1. First screen shows the request form and `Что будет дальше`.
2. Page includes `Перед отправкой` and `После отправки`.
3. Test submission shows `Номер обращения`.
4. Mobile view has no horizontal scroll.

CRM access page:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

Check after `Ctrl + F5` and owner/admin login:

1. `Доступ` opens directly.
2. Users and invites are visible.
3. Manager role sees an access message instead of admin controls.
