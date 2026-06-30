# Supabase Edge Functions source

This directory stores GitHub copies of the RA Lider Edge Functions.

Scope for RA Lider CRM:

- `leader-public-lead` — public request intake from the site, live baseline v9, `verify_jwt=false`.
- `leader-crm-leads` — authenticated CRM lead/order actions, live baseline v12, `verify_jwt=true`.
- `leader-crm-orders` — authenticated CRM order list/update actions, live baseline v2, `verify_jwt=true`.

## Operational rule

These files are source snapshots and future implementation sources.

Adding or editing files here does not change Supabase production by itself.

Do not deploy Edge Functions to Supabase production without explicit owner approval.

Before any deploy:

1. Review the diff in GitHub.
2. Confirm role and access changes.
3. Confirm rollback plan.
4. Deploy only the intended function.
5. Run the manual browser checks from `docs/CRM_PUBLIC_REQUEST_CHAIN_CHECK_2026-06-30.md`.

## Security

Never commit service role keys, JWT secrets, API keys, passwords or live environment values.

Functions must read secrets from environment variables such as:

- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`;
- `SUPABASE_SERVICE_ROLE_KEY`.
