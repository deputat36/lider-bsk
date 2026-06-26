# Navigator v2 API hardening plan — 2026-06-26

Project: `ofewxuqfjhamgerwzull`.

## Current state

Supabase Security Advisor still reports `authenticated_security_definer_function_executable` for `15` SECURITY DEFINER functions in `public`.

Current aggregate count:

- SECURITY DEFINER functions in `public`: `64`;
- executable by `authenticated`: `15`;
- not executable by `authenticated`: `49`.

The remaining set has two categories:

1. RLS helper functions used by table policies.
2. Active browser-facing Navigator v2 RPC used by the deal card UI.

This plan covers the second category: moving active Navigator v2 browser RPC behind an Edge Function/API layer so direct `/rest/v1/rpc/*` access can later be revoked from `authenticated`.

## Active browser-facing RPC

The current deal card UI calls these RPC from `assets/js/nav-v2/deal-card-v2.js` and `assets/js/nav-v2/deal-card-stay-v2.js`:

- `nav_v2_get_deal_card(p_deal_id uuid)`;
- `nav_v2_add_comment(p_deal_id uuid, p_body text, p_visibility text)`;
- `nav_v2_update_deal_status(p_deal_id uuid, p_status nav_v2_deal_status)`;
- `nav_v2_update_document_status(p_document_id uuid, p_status text)`;
- `nav_v2_update_task_status(p_task_id uuid, p_status nav_v2_task_status)`.

These cannot be revoked immediately because the current browser flow depends on them.

## Preflight status

Earlier audit found that `deal-card-v2.js` and `deal-card-stay-v2.js` import `./supabase-v2.js`, while `deal-card-v2.html` imports `./assets/js/nav-v2/role-menu-v2.js`; both modules were missing from GitHub Contents API/search.

Preflight fix path:

- restore `assets/js/nav-v2/supabase-v2.js` with the expected exports used by the deal card UI;
- restore `assets/js/nav-v2/role-menu-v2.js` as a safe browser-only helper;
- add `.github/workflows/navigator-v2-check.yml` to verify `deal-card-v2.html` references and relative ES module imports under `assets/js/nav-v2/**`.

Do not start the Edge Function migration unless `Navigator v2 check` is green.

## Phase 2 status

A repository-only skeleton for `nav-v2-deal-api` has been added under `supabase/functions/nav-v2-deal-api/index.ts`.

Current skeleton behavior:

- `verify_jwt=true` is recorded in `supabase/config.toml`;
- handles `OPTIONS` and `POST` only;
- validates the incoming bearer token with `/auth/v1/user` using `SUPABASE_URL` and `SUPABASE_ANON_KEY`;
- accepts only the planned action whitelist;
- returns `501` for every action because behavior parity has not been ported yet;
- does not use `SUPABASE_SERVICE_ROLE_KEY` yet;
- does not call current RPC and does not mutate data.

The function is not wired into browser code and should not replace direct RPC until `get_deal_card` is implemented and manually verified.

## Target architecture

Add one authenticated Edge Function:

`nav-v2-deal-api`

Settings:

- `verify_jwt=true`;
- validates the incoming user JWT with `/auth/v1/user` using the anon key;
- uses the service-role key only inside the Edge Function;
- never exposes service-role credentials to browser code;
- accepts a small action-based API instead of exposing arbitrary RPC names.

Suggested action contract:

```json
{ "action": "get_deal_card", "deal_id": "..." }
{ "action": "add_comment", "deal_id": "...", "body": "...", "visibility": "team" }
{ "action": "update_deal_status", "deal_id": "...", "status": "need_documents" }
{ "action": "update_document_status", "document_id": "...", "status": "checked" }
{ "action": "update_task_status", "task_id": "...", "status": "done" }
```

## Required authorization model

The Edge Function must not simply call current RPC with the service-role key.

Reason: current RPC logic relies on `auth.uid()` for the browser user. Calling those RPC as service-role would either lose the user identity or bypass intended checks.

Instead, the Edge Function must:

1. validate the browser JWT;
2. extract `user.id` from `/auth/v1/user`;
3. use explicit helper calls with that user id, for example:
   - `nav_v2_can_view_deal(deal_id, user.id)`;
   - `nav_v2_can_edit_deal(deal_id, user.id)`;
   - `nav_v2_can_change_deal_status(deal_id, status, user.id)`;
   - `nav_v2_can_change_document_status(document_id, status, user.id)`;
   - `nav_v2_can_change_task_status(task_id, user.id)`;
4. perform service-role table reads/writes only after the explicit authorization check passes;
5. write the same audit events currently written by RPC.

## Behavior parity checklist

### `get_deal_card`

Must preserve:

- active user profile lookup;
- manager profile fields;
- deal payload shape;
- participants, risks, documents, expenses, tasks, comments, reviews, events;
- private comment filtering;
- `can_change_status`, `can_mark_received`, `can_mark_checked`, `can_mark_problem` fields;
- service-side access denial when `nav_v2_can_view_deal(deal_id, user.id)` is false.

### `add_comment`

Must preserve:

- empty-body validation;
- visibility whitelist: `team`, `private`, `public`;
- author id and author role;
- automatic review creation for recognized lawyer quick-action comments;
- `comment_added` / `comment_added_with_review` event logging.

### `update_deal_status`

Must preserve:

- status required validation;
- `nav_v2_can_edit_deal` check;
- `nav_v2_can_change_deal_status` check;
- positive-status blockers:
  - problem documents;
  - overdue requested documents;
  - unresolved required documents;
  - blocking reviews;
- `status_changed` event logging.

### `update_document_status`

Must preserve the behavior currently delegated through `nav_v2_update_document_workflow`, including permission checks, workflow fields, event logging, and any document-specific validation.

This endpoint should not be ported by guessing table updates. Read and mirror `nav_v2_update_document_workflow` first.

### `update_task_status`

Must preserve:

- status required validation;
- `nav_v2_can_change_task_status` check;
- `completed_by` / `completed_at` handling for `done`;
- `task_status_changed` event logging.

## Implementation phases

### Phase 1 — inventory fix

- Resolve the `supabase-v2.js` and `role-menu-v2.js` path mismatches.
- Confirm the actual browser RPC helper implementation.
- Add or update a static check that fails when `deal-card-v2.html` or Navigator v2 modules reference missing files.

### Phase 2 — Edge Function skeleton

- Add `supabase/functions/nav-v2-deal-api/index.ts`.
- Implement CORS, JSON responses, JWT validation, service-role REST helpers.
- Implement only `get_deal_card` first.
- Keep browser code on the old RPC while the function is verified manually.

### Phase 3 — read flow migration

- Change the deal card load path from direct `rpc('nav_v2_get_deal_card', ...)` to the Edge Function action `get_deal_card`.
- Verify owner/admin/manager/spn/lawyer/broker views.
- Verify a user without access receives `403`.

### Phase 4 — write flow migration

Migrate one write action at a time:

1. `add_comment`;
2. `update_task_status`;
3. `update_document_status`;
4. `update_deal_status`.

After each action:

- verify UI success path;
- verify unauthorized user denial;
- verify event logging;
- verify no regression in `deal-card-stay-v2.js` scroll behavior.

### Phase 5 — REVOKE direct browser RPC

Only after all browser calls are migrated and tested:

```sql
revoke execute on function public.nav_v2_get_deal_card(uuid) from authenticated;
revoke execute on function public.nav_v2_add_comment(uuid, text, text) from authenticated;
revoke execute on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) from authenticated;
revoke execute on function public.nav_v2_update_document_status(uuid, text) from authenticated;
revoke execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status) from authenticated;
```

Expected advisor impact: reduce `authenticated_security_definer_function_executable` warnings from `15` to `10`.

## Regression tests required before REVOKE

Use real role coverage where possible:

- owner/admin can load and change relevant records;
- manager can load assigned/managed deals and change allowed statuses;
- spn can perform allowed workflow actions only;
- lawyer can perform legal quick actions and comments;
- broker can perform broker-allowed actions only;
- unrelated authenticated user cannot load the card or mutate records;
- disabled profile cannot load or mutate records;
- document status updates preserve page position and update the DOM;
- task status updates preserve page position and update the DOM;
- legal quick actions create expected comments/reviews/events;
- positive deal statuses are blocked by missing/problem documents and blocking reviews.

## Rollback plan

If the Edge Function migration breaks UI behavior:

1. keep direct RPC grants unchanged;
2. switch browser code back to direct `rpc(...)` calls;
3. keep the Edge Function deployed but unused for log inspection;
4. do not apply the final REVOKE migration.

If the final REVOKE has already been applied and rollback is needed:

```sql
grant execute on function public.nav_v2_get_deal_card(uuid) to authenticated;
grant execute on function public.nav_v2_add_comment(uuid, text, text) to authenticated;
grant execute on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) to authenticated;
grant execute on function public.nav_v2_update_document_status(uuid, text) to authenticated;
grant execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status) to authenticated;
```

## Out of scope

RLS helper functions are not part of this Edge Function migration. Those require a separate RLS architecture review because table policies currently depend on them.

Auth leaked password protection is also out of scope for SQL/API migration. It must be enabled in Supabase Auth settings if project policy allows it.
