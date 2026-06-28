# Navigator v2 deal API deployment — 2026-06-26

Project: `ofewxuqfjhamgerwzull`.

## Deployment

Edge Function deployed to Supabase production:

- slug: `nav-v2-deal-api`;
- current observed version: `2`;
- status: `ACTIVE`;
- `verify_jwt`: `true`;
- current observed deployed SHA: `3f438c82f2dbffdf03fbfb745369367507b9f61ddaa62b6b3d2d229d937ec455`;
- deployed source path: `supabase/functions/nav-v2-deal-api/index.ts`.

Original version `1` was deployed from the implementation merged in PR `#36` with SHA `c311af455cf701497ba94627b87b251a2ded78ad682a18268370869fc5092335`.

After PR `#62`, the GitHub source file `supabase/functions/nav-v2-deal-api/index.ts` is synchronized with the already deployed Supabase version `2`. This was a repository source sync only: no Supabase deploy was performed by PR `#62`.

## Current behavior

Implemented actions in the current observed deployed version:

- `get_deal_card`;
- `get_deal_card_lite`;
- `add_comment`;
- `update_deal_status`;
- `update_document_status`;
- `update_document_workflow`;
- `update_task_status`.

The function:

- requires a valid user JWT because `verify_jwt=true`;
- validates the incoming bearer token through `/auth/v1/user`;
- validates UUID inputs before calling RPCs;
- validates enum inputs for deal, document, task, visibility, and role fields;
- calls explicit `/rest/v1/rpc/nav_v2_*` functions with the caller's JWT and `SUPABASE_ANON_KEY`;
- returns the RPC payload under `data`.

The function does not use service-role keys and does not proxy arbitrary RPC names from the request body.

## Explicit non-changes

This repository sync did not change:

- database schema;
- migrations;
- RLS policies;
- grants;
- browser default routing;
- Edge Function deployment state.

Current SECURITY DEFINER baseline observed on 2026-06-28 after PR `#68` read-only connector check:

- SECURITY DEFINER functions in `public`: `70`;
- executable by `authenticated`: `46`;
- not executable by `authenticated`: `24`.

This is a read-only observation of the current Supabase project state, not a change introduced by this repository documentation/source sync.

## Verification performed

Verified through Supabase connector:

- project status: `ACTIVE_HEALTHY`;
- `nav-v2-deal-api` appears in Edge Functions list;
- deployed version is `2`;
- deployed function has `verify_jwt=true`;
- deployed SHA is `3f438c82f2dbffdf03fbfb745369367507b9f61ddaa62b6b3d2d229d937ec455`;
- deployed function source is readable;
- Edge Function logs are currently empty in the connector result.

## Smoke test tooling

A no-secret auth guard test is available after PR `#42` and checks an additional invalid bearer case after PR `#45`:

```bash
NAV_V2_DEAL_ID='deal-uuid' \
node tools/nav_v2_deal_api_auth_guard_test.mjs
```

After PR `#65`, the same auth guard supports `NAV_V2_ACTION` for read actions. Supported values are `get_deal_card` and `get_deal_card_lite`; the default remains `get_deal_card`:

```bash
NAV_V2_DEAL_ID='deal-uuid' \
NAV_V2_ACTION='get_deal_card_lite' \
node tools/nav_v2_deal_api_auth_guard_test.mjs
```

After PR `#67`, the auth guard also supports local-only preflight validation. It validates the selected read action and exits before any Edge Function request:

```bash
NAV_V2_AUTH_GUARD_PREFLIGHT_ONLY=1 \
NAV_V2_ACTION='get_deal_card_lite' \
node tools/nav_v2_deal_api_auth_guard_test.mjs
```

It sends the selected read action in two unauthenticated/invalid-auth cases and expects a `401` or `403` rejection without a successful data payload:

- without an `Authorization` header;
- with `Authorization: Bearer invalid-nav-v2-token`.

A standalone no-secret GitHub Actions workflow is available after PR `#43`:

- workflow name: `Navigator v2 deal API auth guard`;
- workflow file: `.github/workflows/nav-v2-deal-api-auth-guard.yml`;
- trigger: `workflow_dispatch` only;
- inputs: optional `deal_id`, optional `read_action` (`get_deal_card` or `get_deal_card_lite`), optional `preflight_only`, optional `supabase_url`;
- secrets: none.

After PR `#44`, the standalone auth guard workflow writes the JSON result to the GitHub Actions Step Summary under `Navigator v2 deal API auth guard`. After PR `#45`, the summary includes each auth guard case returned by the script. After PR `#65`, the summary also records the selected read action. After PR `#68`, `preflight_only=true` makes the standalone workflow validate the selected read action locally and exit before any Edge Function call.

Use it when you want to verify only the public auth boundary without configuring `NAV_V2_JWT`.

A local authenticated smoke test is available:

```bash
NAV_V2_JWT='user-access-token' \
NAV_V2_DEAL_ID='deal-uuid' \
node tools/nav_v2_deal_api_smoke_test.mjs
```

After PR `#64`, choose the read action with `NAV_V2_ACTION`. Supported values are `get_deal_card` and `get_deal_card_lite`; the default remains `get_deal_card`:

```bash
NAV_V2_JWT='user-access-token' \
NAV_V2_DEAL_ID='deal-uuid' \
NAV_V2_ACTION='get_deal_card_lite' \
node tools/nav_v2_deal_api_smoke_test.mjs
```

Optional direct RPC shape comparison:

```bash
NAV_V2_JWT='user-access-token' \
NAV_V2_DEAL_ID='deal-uuid' \
NAV_V2_COMPARE_DIRECT_RPC=1 \
node tools/nav_v2_deal_api_smoke_test.mjs
```

When `NAV_V2_ACTION=get_deal_card_lite`, direct comparison uses `nav_v2_get_deal_card_lite`. Otherwise it uses `nav_v2_get_deal_card`.

Optional local preflight-only validation:

```bash
NAV_V2_JWT='user-access-token' \
NAV_V2_DEAL_ID='deal-uuid' \
NAV_V2_PREFLIGHT_ONLY=1 \
node tools/nav_v2_deal_api_smoke_test.mjs
```

`NAV_V2_PREFLIGHT_ONLY=1` runs the local environment/JWT/API-key/read-action checks and exits before any Edge Function or direct RPC request. It does not prove runtime access to a deal.

Optional override for the public API key:

```bash
NAV_V2_API_KEY='sb_publishable_...' node tools/nav_v2_deal_api_smoke_test.mjs
```

After PR `#49`, `tools/nav_v2_deal_api_smoke_test.mjs` rejects unsafe `NAV_V2_API_KEY` values before network calls:

- secret keys with the `sb_` + `secret_` prefix;
- JWT API keys whose decoded payload has `role = service_role`.

After PR `#50`, `tools/nav_v2_deal_api_smoke_test.mjs` also rejects unsafe `NAV_V2_JWT` values before network calls. The token must decode as a user access JWT with:

- `role = authenticated`;
- a non-empty `sub` claim;
- an `exp` claim.

After PR `#51`, the same smoke script also rejects expired `NAV_V2_JWT` values before network calls. The decoded `exp` value must be later than the current runner time.

After PR `#52`, the same smoke script also rejects `NAV_V2_JWT` values issued by a different Supabase project before network calls. The decoded `iss` value must match `${NAV_V2_SUPABASE_URL}/auth/v1` after trimming trailing slashes from `NAV_V2_SUPABASE_URL`.

After PR `#53`, the same smoke script also rejects `NAV_V2_JWT` values whose decoded `aud` value is not `authenticated` before network calls.

After PR `#54`, the same smoke script also rejects anonymous-user JWTs when the decoded `is_anonymous` claim is `true` before network calls.

After PR `#55`, `tools/nav_v2_deal_api_smoke_preflight_test.mjs` runs no-secret preflight cases with synthetic unsigned JWTs. It verifies that malformed, wrong-issuer, wrong-audience, wrong-role, anonymous, missing-subject, expired, secret-key, and service-role API-key cases fail before any Edge Function or direct RPC call can be made.

After PR `#56`, the preflight test suite also verifies a positive synthetic user-token case through `NAV_V2_PREFLIGHT_ONLY=1`, confirming the local checks can pass without making a network request.

After PR `#64`, the preflight test suite also verifies `NAV_V2_ACTION=get_deal_card_lite` and rejects unsupported actions such as write actions in the read smoke script.

After PR `#57`, the manual `Navigator v2 deal API smoke` workflow exposes the same local-only behavior through its `preflight_only` input. Set `preflight_only=true` to validate `secrets.NAV_V2_JWT`, `deal_id`, `supabase_url`, and API-key guardrails without calling the Edge Function or direct RPC from the authenticated smoke step. This mode does not prove runtime access to a deal.

After PR `#58`, the same manual workflow also skips the no-secret auth guard step when `preflight_only=true`. In this mode the entire workflow performs only checkout, script syntax validation, local input validation, and local JWT/API-key preflight checks; it does not call the Edge Function or direct RPC.

After PR `#59`, the workflow fails fast when `preflight_only=true` and `compare_direct_rpc=true` are both selected. Choose exactly one mode: local preflight validation or runtime direct RPC comparison.

After PR `#60`, a GitHub issue template is available at `.github/ISSUE_TEMPLATE/nav-v2-deal-api-smoke.md` for recording manual runtime smoke results without secrets or full deal payloads.

After PR `#62`, CI validates the version-2 function source shape, including the explicit action allowlist and explicit RPC bridges for read and write actions. Browser routing is still separately protected by `navigator-v2-check.yml` and remains opt-in for `get_deal_card` only.

After PR `#63`, the runtime smoke issue template covers version-2 actions explicitly: `get_deal_card`, `get_deal_card_lite`, `add_comment`, `update_deal_status`, `update_document_status`, `update_document_workflow`, and `update_task_status`. Write-action smoke must use safe test data, note expected side effects, and record cleanup status without private payloads.

After PR `#65`, the no-secret auth guard script and workflows can send either read action. The manual smoke workflow passes its selected `read_action` into both the unauthenticated auth guard step and the authenticated smoke step when `preflight_only=false`.

After PR `#66`, CI also executes the auth guard script with an unsupported `NAV_V2_ACTION` and an intentionally unreachable Supabase URL. The expected local error must be `NAV_V2_ACTION must be one of: get_deal_card, get_deal_card_lite`, proving the action whitelist fails before any runtime Edge Function call is required.

After PR `#67`, CI executes the auth guard in `NAV_V2_AUTH_GUARD_PREFLIGHT_ONLY=1` mode for both supported read actions. It uses an intentionally unreachable Supabase URL and requires local JSON output with `preflight_only: true`, proving both allowed selectors validate before runtime.

After PR `#68`, CI protects the standalone no-secret auth guard workflow `preflight_only` input and summary text. The standalone workflow remains secret-free and can run either local-only action validation or runtime unauthenticated rejection checks.

The smoke tests intentionally read user JWT and deal id values from environment variables. Do not commit JWTs, real user sessions, service-role keys, secret API keys, or private test data.

CI validates the smoke-test source with `node --check`, secret/JWT marker scans, no-secret preflight cases, the auth guard unsupported-action fail-fast case, auth guard allowed-action local preflight cases, and standalone auth guard workflow preflight wiring. CI does not execute a successful authenticated runtime call because that would require a live user JWT.

## Manual GitHub Actions smoke workflow

A manual workflow is available after PR `#39` and includes an auth guard preflight after PR `#42`:

- workflow name: `Navigator v2 deal API smoke`;
- workflow file: `.github/workflows/nav-v2-deal-api-smoke.yml`;
- trigger: `workflow_dispatch` only;
- required repository secret for authenticated smoke: `NAV_V2_JWT`;
- required workflow input: `deal_id`;
- optional workflow input after PR `#64`: `read_action` (`get_deal_card` or `get_deal_card_lite`);
- optional workflow input: `compare_direct_rpc`;
- optional workflow input: `preflight_only`;
- `supabase_url` must match `https://ofewxuqfjhamgerwzull.supabase.co` in this workflow.

After PR `#47`, the workflow validates `deal_id` as UUID before any runtime Edge Function calls. Invalid input fails fast before both the no-secret auth guard and the authenticated smoke step.

After PR `#48`, the workflow validates `supabase_url` against the production Supabase project URL before any runtime Edge Function calls. This prevents a manual smoke run from sending `secrets.NAV_V2_JWT` to a mistyped or untrusted Supabase-compatible URL.

After PR `#57`, the workflow can run the authenticated smoke step in local preflight-only mode by setting `preflight_only=true`. In this mode the workflow still requires `secrets.NAV_V2_JWT`, validates it locally, and exits before any authenticated Edge Function or direct RPC request.

After PR `#58`, `preflight_only=true` also skips the no-secret auth guard step, so the whole manual run avoids network calls to `nav-v2-deal-api` and `nav_v2_get_deal_card`.

After PR `#59`, the workflow fails fast when `preflight_only=true` and `compare_direct_rpc=true` are both selected. Choose exactly one mode: local preflight validation or runtime direct RPC comparison.

After PR `#60`, record runtime smoke results with the `Navigator v2 deal API runtime smoke` issue template. Include the workflow run URL and pass/fail statuses. Do not paste JWTs, refresh tokens, service-role keys, secret API keys, personal client data, or full deal payloads.

After PR `#63`, use the same issue template to record v2 read-lite and write-action smoke results. For write actions, use only reversible test data and include whether cleanup completed.

After PR `#64`, the manual workflow can run either `get_deal_card` or `get_deal_card_lite` via the `read_action` input. The workflow still does not run write actions.

After PR `#65`, that same `read_action` input is also passed to the no-secret auth guard step, so the unauthenticated rejection check and authenticated smoke step cover the same read action.

Workflow order:

1. Validate smoke scripts with `node --check`.
2. Validate workflow input `deal_id` as UUID.
3. Validate workflow input `read_action` as `get_deal_card` or `get_deal_card_lite`.
4. Validate workflow input `supabase_url` against the production project URL.
5. Validate smoke mode inputs and reject `preflight_only=true` with `compare_direct_rpc=true`.
6. Run `nav_v2_deal_api_auth_guard_test.mjs` for the selected read action and require each no-secret auth guard case to return `401` or `403`, unless `preflight_only=true`.
7. Run `nav_v2_deal_api_smoke_test.mjs` with `secrets.NAV_V2_JWT`, or run its local-only preflight path when `preflight_only=true`.

After PR `#44`, both runtime steps write compact JSON output to the GitHub Actions Step Summary:

- `Navigator v2 deal API auth guard`;
- `Navigator v2 deal API authenticated smoke`.

Use a short-lived test-user access token for `NAV_V2_JWT`. Rotate or remove the secret after the smoke-test window. Do not use a service-role key, anon key, production admin personal token, anonymous-user token, or long-lived real user session for this workflow.

When `compare_direct_rpc=true`, the workflow also calls the matching direct read RPC with the same user JWT and compares the response shape with the Edge Function response. When `preflight_only=true`, the workflow exits before the auth guard, the authenticated Edge Function call, and the direct RPC comparison.

## Browser opt-in preflight

An opt-in browser path is available after PR `#40`:

- default behavior remains direct `supabase.rpc('nav_v2_get_deal_card')`;
- `nav_v2_get_deal_card` is routed through `nav-v2-deal-api` only when explicitly enabled;
- enable for one URL with `?edge_api=1`;
- force-disable for one URL with `?edge_api=0`;
- enable locally with `localStorage.setItem('leader_nav_v2_use_deal_api_edge', '1')`;
- disable locally with `localStorage.removeItem('leader_nav_v2_use_deal_api_edge')`.

After PR `#46`, `.github/workflows/navigator-v2-check.yml` statically protects those browser opt-in boundaries:

- the Edge route must stay behind `shouldUseDealApiEdge()`;
- `edge_api=1` is the explicit URL opt-in;
- `edge_api=0` is the explicit URL opt-out;
- localStorage enables the route only when `leader_nav_v2_use_deal_api_edge` equals `1`;
- direct `supabase.rpc(name, params)` fallback must remain present;
- browser code must not route write actions through `nav-v2-deal-api` in this phase.

After PR `#41`, `deal-card-v2.html` accepts both deal id query names:

- primary: `?id=<deal-uuid>`;
- compatibility alias: `?deal_id=<deal-uuid>`.

The browser opt-in path still affects only the read action `get_deal_card`. Even though the deployed Edge Function version `2` can proxy write RPCs, browser write actions must stay on their existing direct RPC paths until a separate reviewed browser migration explicitly changes that behavior.

## Still required before default browser read migration

Before making the Edge Function the default read path in `deal-card-v2.js`:

1. Manually invoke `nav-v2-deal-api` with a real authenticated user JWT.
2. Verify `get_deal_card` and `get_deal_card_lite` for allowed roles: owner/admin/manager/spn/lawyer/broker.
3. Verify an unrelated authenticated user is denied.
4. Verify a disabled profile is denied.
5. Compare payload shape against direct `nav_v2_get_deal_card` and `nav_v2_get_deal_card_lite` output.
6. Test the browser opt-in path with `?edge_api=1` on a real deal card URL.
7. Test both browser URL forms: `?id=<deal-uuid>` and `?deal_id=<deal-uuid>`.
8. Capture the result in `.github/ISSUE_TEMPLATE/nav-v2-deal-api-smoke.md` without secrets, personal client data, or full payloads.

Before routing browser write actions through the Edge Function, separately verify `add_comment`, `update_deal_status`, `update_document_status`, `update_document_workflow`, and `update_task_status` with reversible test data and record cleanup status in the same issue template.

This deployment is a runtime preflight step, not the final browser migration step. It still relies on the existing authenticated RPC grants for the underlying `nav_v2_*` functions.
