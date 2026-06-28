# Navigator v2 auth guard Supabase URL allowlist — 2026-06-28

Project: `ofewxuqfjhamgerwzull`.

## Change

The standalone no-secret workflow `.github/workflows/nav-v2-deal-api-auth-guard.yml` now validates the `workflow_dispatch` input `supabase_url` before running `tools/nav_v2_deal_api_auth_guard_test.mjs`.

Allowed URL:

```text
https://ofewxuqfjhamgerwzull.supabase.co
```

If the input does not match the production project URL, the workflow fails before any auth-guard request can be made.

## Reason

The standalone auth guard workflow does not use repository secrets or `NAV_V2_JWT`, but it still sends the public Supabase API key used by the test script. Keeping `supabase_url` allowlisted prevents a manual workflow run from sending that key to an arbitrary Supabase-compatible URL.

This mirrors the production URL validation already present in the authenticated manual smoke workflow.

## CI guard

`.github/workflows/nav-v2-auth-guard-workflow-check.yml` protects the standalone workflow contract by checking that:

- `supabase_url` remains present;
- the production URL allowlist remains present;
- the fail-fast error and success messages remain present;
- the workflow stays free of `NAV_V2_JWT`, `secrets.*`, service-role, and secret-key markers.

## Supabase read-only snapshot

Observed through the Supabase connector on 2026-06-28:

- project status: `ACTIVE_HEALTHY`;
- `nav-v2-deal-api` version: `2`;
- `nav-v2-deal-api` status: `ACTIVE`;
- `nav-v2-deal-api` `verify_jwt`: `true`;
- deployed SHA: `3f438c82f2dbffdf03fbfb745369367507b9f61ddaa62b6b3d2d229d937ec455`;
- Edge Function logs returned no entries in the connector result.

Current SECURITY DEFINER baseline observed read-only on 2026-06-28:

- SECURITY DEFINER functions in `public`: `70`;
- executable by `authenticated`: `46`;
- not executable by `authenticated`: `24`.

No Supabase schema, RLS, grants, data, or Edge Function deployment was changed.
