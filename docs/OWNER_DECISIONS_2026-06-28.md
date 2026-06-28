# Owner decisions — 2026-06-28

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Source context: `docs/SUPABASE_RA_LIDER_ADVISORS_2026-06-28.md` and read-only Supabase checks.

This document separates what Codex can continue doing autonomously from decisions that require explicit owner approval.

## No owner action required right now

RA Lider baseline is stable:

- `leader-public-lead` remains `ACTIVE` v9 with `verify_jwt=false`.
- `leader-crm-leads` remains `ACTIVE` v12 with `verify_jwt=true`.
- `leader-crm-orders` remains `ACTIVE` v2 with `verify_jwt=true`.
- Active CRM profiles remain: owner `2`, admin `1`, manager `1`.
- Public exposed `public.leader_%` SECURITY DEFINER execute count for `anon`, `authenticated`, `public` remains `0`.

Codex can keep working autonomously on:

- GitHub documentation;
- GitHub Actions guardrails;
- browser-test checklists;
- read-only Supabase verification;
- issue #15 status updates.

## Decisions requiring explicit owner approval

### Enable leaked password protection

Supabase Auth advisor reports `auth_leaked_password_protection` because leaked password protection is disabled.

Owner decision needed:

- approve enabling leaked password protection in Supabase Auth;
- accept possible sign-up/password-change friction for users with compromised passwords;
- request a rollback plan before changing the setting.

Codex should not change this autonomously.

### Touch `nav_*` / `nav_v2_*` SECURITY DEFINER warnings

Security advisor shows `authenticated_security_definer_function_executable` warnings for `nav_*` / `nav_v2_*` functions.

Owner decision needed:

- explicitly say that Navigator scope is in scope;
- identify whether the expected access model is direct RPC execute or Edge Function mediation;
- approve any grant changes or function rewrites.

Codex should not change `nav_*` while working on RA Lider.

### Drop or rewrite `leader_*` indexes

Performance advisor shows `unused_index` INFO notices for several `leader_*` indexes.

Owner decision needed:

- approve a performance cleanup task;
- provide or approve production traffic assumptions;
- require rollback SQL before any index drop.

Codex should not drop indexes autonomously. Low traffic and new workflows can make valid indexes look unused.

### Rewrite RLS policies for performance

Performance advisor may report `auth_rls_initplan` or policy-related warnings in the project.

Owner decision needed:

- approve a dedicated RLS performance pass;
- require before/after policy inventory;
- require rollback SQL;
- confirm whether the scope includes only `leader_*` or also older non-RA-Lider tables.

Codex should not rewrite RLS policies autonomously.

### Deploy or change Edge Functions

Owner decision needed for any production Edge Function deploy unless the owner explicitly requests a narrow hotfix.

For a deploy request, Codex should provide:

- function name;
- exact diff summary;
- risk;
- rollback plan;
- post-deploy verification query/check.

## Exact approval wording

Use this wording for Supabase production changes:

```text
Разрешаю точечное изменение Supabase production.
Scope: <что именно можно менять>.
Перед изменением дай план, риск и rollback.
После изменения проверь SQL-запросом и запиши результат в GitHub/issue #15.
```

Without this wording, Codex should treat Supabase as read-only.

## Manual browser check still pending

Use:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

After Ctrl+F5 and owner/admin login, confirm:

- `Доступ` opens;
- invite controls are visible;
- users without invite do not become active automatically.
