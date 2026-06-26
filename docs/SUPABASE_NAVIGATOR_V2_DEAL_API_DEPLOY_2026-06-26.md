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

## Still required before browser migration

Before changing `deal-card-v2.js` to call the Edge Function:

1. Manually invoke `nav-v2-deal-api` with a real authenticated user JWT.
2. Verify `get_deal_card` for allowed roles: owner/admin/manager/spn/lawyer/broker.
3. Verify an unrelated authenticated user is denied.
4. Verify a disabled profile is denied.
5. Compare payload shape against direct `nav_v2_get_deal_card` output.

This deployment is a runtime preflight step, not the final hardening step. It still relies on the existing `authenticated` EXECUTE grant for `nav_v2_get_deal_card`.
