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

Current SECURITY DEFINER baseline remains:

- SECURITY DEFINER functions in `public`: `64`;
- executable by `authenticated`: `15`;
- not executable by `authenticated`: `49`.

## Verification performed

Verified through Supabase connector:

- project status: `ACTIVE_HEALTHY`;
- `nav-v2-deal-api` appears in Edge Functions list;
- deployed version is `1`;
- deployed function has `verify_jwt=true`;
- deployed function source is readable;
- Edge Function logs are currently empty, meaning no runtime invocation has been observed yet.

## Smoke test tooling

A local smoke test is available:

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

The smoke test intentionally reads the user JWT and deal id from environment variables. Do not commit JWTs, real user sessions, or private test data.

CI validates the smoke-test source with `node --check` and secret/JWT marker scans, but CI does not execute a successful runtime call because that would require a live user JWT.

## Manual GitHub Actions smoke workflow

A manual workflow is available after PR `#39`:

- workflow name: `Navigator v2 deal API smoke`;
- workflow file: `.github/workflows/nav-v2-deal-api-smoke.yml`;
- trigger: `workflow_dispatch` only;
- required repository secret: `NAV_V2_JWT`;
- required workflow input: `deal_id`;
- optional workflow input: `compare_direct_rpc`;
- optional workflow input: `supabase_url`, defaulting to `https://ofewxuqfjhamgerwzull.supabase.co`.

Use a short-lived test-user access token for `NAV_V2_JWT`. Rotate or remove the secret after the smoke-test window. Do not use a service-role key, production admin personal token, or long-lived real user session for this workflow.

When `compare_direct_rpc=true`, the workflow also calls direct `nav_v2_get_deal_card` with the same user JWT and compares the response shape with the Edge Function response.

## Browser opt-in preflight

An opt-in browser path is available after PR `#40`:

- default behavior remains direct `supabase.rpc('nav_v2_get_deal_card')`;
- `nav_v2_get_deal_card` is routed through `nav-v2-deal-api` only when explicitly enabled;
- enable for one URL with `?edge_api=1`;
- force-disable for one URL with `?edge_api=0`;
- enable locally with `localStorage.setItem('leader_nav_v2_use_deal_api_edge', '1')`;
- disable locally with `localStorage.removeItem('leader_nav_v2_use_deal_api_edge')`.

The opt-in path affects only the read action `get_deal_card`. Write actions still call their existing direct RPC functions because the Edge Function write actions intentionally return `501` in this phase.

## Still required before default browser migration

Before making the Edge Function the default path in `deal-card-v2.js`:

1. Manually invoke `nav-v2-deal-api` with a real authenticated user JWT.
2. Verify `get_deal_card` for allowed roles: owner/admin/manager/spn/lawyer/broker.
3. Verify an unrelated authenticated user is denied.
4. Verify a disabled profile is denied.
5. Compare payload shape against direct `nav_v2_get_deal_card` output.
6. Test the browser opt-in path with `?edge_api=1` on a real deal card URL.

This deployment is a runtime preflight step, not the final hardening step. It still relies on the existing `authenticated` EXECUTE grant for `nav_v2_get_deal_card`.
