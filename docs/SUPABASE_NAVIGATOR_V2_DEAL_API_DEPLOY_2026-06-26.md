# Navigator v2 deal API deployment — 2026-06-26

Project: `ofewxuqfjhamgerwzull`.

## Deployment

Edge Function deployed to Supabase production:

- slug: `nav-v2-deal-api`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt`: `true`;
- deployed SHA: `c311af455cf701497ba94627b87b251a2ded78ad682a18268370869fc5092335`;
- deployed source path: `supabase/functions/nav-v2-deal-api/index.ts`.

The deployed source matches the GitHub implementation merged in PR `#36`.

## Current behavior

Implemented action:

- `get_deal_card`.

The action:

- requires a valid user JWT because `verify_jwt=true`;
- validates the incoming bearer token through `/auth/v1/user`;
- validates `deal_id` as UUID;
- calls `/rest/v1/rpc/nav_v2_get_deal_card` with the caller's JWT and `SUPABASE_ANON_KEY`;
- returns the RPC payload under `data`.

Not implemented yet:

- `add_comment`;
- `update_deal_status`;
- `update_document_status`;
- `update_task_status`.

Those actions still return `501`.

## Explicit non-changes

This deployment did not change:

- database schema;
- migrations;
- RLS policies;
- grants;
- browser code;
- direct Navigator v2 RPC grants.

Current SECURITY DEFINER baseline observed on 2026-06-27:

- SECURITY DEFINER functions in `public`: `65`;
- executable by `authenticated`: `41`;
- not executable by `authenticated`: `24`.

## Verification performed

Verified through Supabase connector:

- project status: `ACTIVE_HEALTHY`;
- `nav-v2-deal-api` appears in Edge Functions list;
- deployed version is `1`;
- deployed function has `verify_jwt=true`;
- deployed function source is readable;
- Edge Function logs are currently empty, meaning no runtime invocation has been observed yet.

## Smoke test tooling

A no-secret auth guard test is available after PR `#42` and checks an additional invalid bearer case after PR `#45`:

```bash
NAV_V2_DEAL_ID='deal-uuid' \
node tools/nav_v2_deal_api_auth_guard_test.mjs
```

It sends `get_deal_card` in two unauthenticated/invalid-auth cases and expects a `401` or `403` rejection without a successful data payload:

- without an `Authorization` header;
- with `Authorization: Bearer invalid-nav-v2-token`.

A standalone no-secret GitHub Actions workflow is available after PR `#43`:

- workflow name: `Navigator v2 deal API auth guard`;
- workflow file: `.github/workflows/nav-v2-deal-api-auth-guard.yml`;
- trigger: `workflow_dispatch` only;
- inputs: optional `deal_id`, optional `supabase_url`;
- secrets: none.

After PR `#44`, the standalone auth guard workflow writes the JSON result to the GitHub Actions Step Summary under `Navigator v2 deal API auth guard`. After PR `#45`, the summary includes each auth guard case returned by the script.

Use it when you want to verify only the public auth boundary without configuring `NAV_V2_JWT`.

A local authenticated smoke test is available:

```bash
NAV_V2_JWT='user-access-token' \
NAV_V2_DEAL_ID='deal-uuid' \
node tools/nav_v2_deal_api_smoke_test.mjs
```

Optional direct RPC shape comparison:

```bash
NAV_V2_JWT='user-access-token' \
NAV_V2_DEAL_ID='deal-uuid' \
NAV_V2_COMPARE_DIRECT_RPC=1 \
node tools/nav_v2_deal_api_smoke_test.mjs
```

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

The smoke tests intentionally read user JWT and deal id values from environment variables. Do not commit JWTs, real user sessions, service-role keys, secret API keys, or private test data.

CI validates the smoke-test source with `node --check`, secret/JWT marker scans, and no-secret preflight cases. CI does not execute a successful authenticated runtime call because that would require a live user JWT.

## Manual GitHub Actions smoke workflow

A manual workflow is available after PR `#39` and includes an auth guard preflight after PR `#42`:

- workflow name: `Navigator v2 deal API smoke`;
- workflow file: `.github/workflows/nav-v2-deal-api-smoke.yml`;
- trigger: `workflow_dispatch` only;
- required repository secret for authenticated smoke: `NAV_V2_JWT`;
- required workflow input: `deal_id`;
- optional workflow input: `compare_direct_rpc`;
- `supabase_url` must match `https://ofewxuqfjhamgerwzull.supabase.co` in this workflow.

After PR `#47`, the workflow validates `deal_id` as UUID before any runtime Edge Function calls. Invalid input fails fast before both the no-secret auth guard and the authenticated smoke step.

After PR `#48`, the workflow validates `supabase_url` against the production Supabase project URL before any runtime Edge Function calls. This prevents a manual smoke run from sending `secrets.NAV_V2_JWT` to a mistyped or untrusted Supabase-compatible URL.

Workflow order:

1. Validate smoke scripts with `node --check`.
2. Validate workflow input `deal_id` as UUID.
3. Validate workflow input `supabase_url` against the production project URL.
4. Run `nav_v2_deal_api_auth_guard_test.mjs` and require each no-secret auth guard case to return `401` or `403`.
5. Run `nav_v2_deal_api_smoke_test.mjs` with `secrets.NAV_V2_JWT`.

After PR `#44`, both runtime steps write compact JSON output to the GitHub Actions Step Summary:

- `Navigator v2 deal API auth guard`;
- `Navigator v2 deal API authenticated smoke`.

Use a short-lived test-user access token for `NAV_V2_JWT`. Rotate or remove the secret after the smoke-test window. Do not use a service-role key, anon key, production admin personal token, anonymous-user token, or long-lived real user session for this workflow.

When `compare_direct_rpc=true`, the workflow also calls direct `nav_v2_get_deal_card` with the same user JWT and compares the response shape with the Edge Function response.

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

The opt-in path affects only the read action `get_deal_card`. Write actions still call their existing direct RPC functions because the Edge Function write actions intentionally return `501` in this phase.

## Still required before default browser migration

Before making the Edge Function the default path in `deal-card-v2.js`:

1. Manually invoke `nav-v2-deal-api` with a real authenticated user JWT.
2. Verify `get_deal_card` for allowed roles: owner/admin/manager/spn/lawyer/broker.
3. Verify an unrelated authenticated user is denied.
4. Verify a disabled profile is denied.
5. Compare payload shape against direct `nav_v2_get_deal_card` output.
6. Test the browser opt-in path with `?edge_api=1` on a real deal card URL.
7. Test both browser URL forms: `?id=<deal-uuid>` and `?deal_id=<deal-uuid>`.

This deployment is a runtime preflight step, not the final hardening step. It still relies on the existing `authenticated` EXECUTE grant for `nav_v2_get_deal_card`.
