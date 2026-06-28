# Codex owner playbook — RA Lider

Date: 2026-06-28.

This guide is for the project owner. It describes how to use Codex effectively without writing code.

## Default working mode

Use this prompt for most technical work:

```text
@GitHub @Supabase продолжай автономно.
Фокус: <коротко описать цель>.
GitHub можно менять.
Supabase только read-only, если я отдельно не разрешил production changes.
В конце дай: коммиты, что проверено, что мне проверить руками, что осталось.
```

Recommended default for this project:

- GitHub writes are allowed for docs, frontend fixes, workflows and safe guards.
- Supabase is read-only by default.
- Supabase production changes require explicit owner approval.
- Owner decisions and approval boundaries are tracked in `docs/OWNER_DECISIONS_2026-06-28.md`.
- `leader_*` is in scope.
- `nav_*` is out of scope unless explicitly requested.
- Do not assert CI green when GitHub connector returns empty `statuses` / `workflow_runs` for push commits.

## What the owner should provide

A good task description is short and concrete:

```text
Я вошёл как admin, открыл CRM, после Ctrl+F5 не вижу вкладку Доступ.
Действуй автономно, Supabase только read-only.
```

Useful details:

- page URL;
- role used for login, if known;
- what was expected;
- what was actually visible;
- whether production Supabase changes are allowed;
- whether the work should update issue #15.

## What Codex should do autonomously

For each autonomous pass, Codex should:

1. Set a small task list.
2. Inspect relevant GitHub files and current open PRs.
3. Run targeted Supabase read-only checks when access, auth, RLS, Edge Functions or CRM data are involved.
4. Patch stale code, docs or workflows in GitHub.
5. Add or update GitHub Actions guards for important markers.
6. Record status in issue #15 when the work affects project state.
7. Report concise results: commits, verification, manual checks and limitations.

## Safe autonomous actions

Codex may do these without asking each time:

- update project documentation;
- update browser-test checklists and issue templates;
- add GitHub Actions checks that only validate repository files;
- fix obvious frontend routing, cache-buster or visibility issues;
- read Supabase schema, grants, policies, triggers and role counts;
- compare live Edge Function metadata with documented versions;
- add read-only status snapshots.

## Actions requiring explicit approval

Ask the owner first for:

- Supabase DDL or DML production changes;
- deleting data, functions, policies, indexes or tables;
- changing RLS broadly;
- deploying Edge Functions, except a narrow confirmed hotfix;
- changing Supabase Auth settings such as leaked password protection;
- changing business logic for finance, orders, roles or calculations;
- touching `nav_*` objects;
- sending messages, notifications or emails on behalf of the company;
- creating real test leads that remain in production CRM.

The current decision register is `docs/OWNER_DECISIONS_2026-06-28.md`. Use it before proposing or performing any production Supabase change.

## Manual checks for the owner

Codex cannot always verify GitHub Pages from its environment. The owner should manually check browser behavior.

Current primary CRM URL:

`https://deputat36.github.io/lider-bsk/crm/v4/`

Current direct access URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

After every CRM UI change:

1. Open the URL in a normal browser.
2. Press Ctrl+F5.
3. Log in.
4. Check `CRM build: 20260627-access-route-1` when the task is about access routing.
5. Check the exact button, tab, form or workflow Codex changed.
6. Report what is visible, not just whether it feels correct.

## Production Supabase wording

Use this wording only when production changes are allowed:

```text
Разрешаю точечное изменение Supabase production.
Scope: <что именно можно менять>.
Перед изменением дай план, риск и rollback.
После изменения проверь SQL-запросом и запиши результат в GitHub/issue #15.
```

If this wording is not present, Codex should treat Supabase as read-only.

## Report format expected from Codex

Final answer should include:

- `Changed`: files and purpose;
- `Commits`: commit SHAs;
- `Supabase`: read-only checks or production changes;
- `Manual check`: what the owner should open and verify;
- `Limitations`: CI/API/browser checks that could not be verified.

## Current project anchors

- GitHub repo: `deputat36/lider-bsk`.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Status issue: #15.
- Main status doc: `docs/STATUS.md`.
- Autopilot rules: `docs/AUTOPILOT_RULES.md`.
- Owner decisions: `docs/OWNER_DECISIONS_2026-06-28.md`.
- Access tab runbook: `docs/CRM_ACCESS_TAB_CHECK_2026-06-27.md`.
