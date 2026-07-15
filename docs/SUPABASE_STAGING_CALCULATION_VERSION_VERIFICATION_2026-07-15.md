# Supabase staging verification — calculation.create_version

Date: 2026-07-15.

Repository: `deputat36/lider-bsk`.

Staging project: `otulfnouybahfnsycxqn` (`lider-bsk-staging`).

Production project: `ofewxuqfjhamgerwzull` — read-only during this verification.

## Verified deployed state

The staging project is `ACTIVE_HEALTHY` on PostgreSQL 17.6.

Applied migrations:

- `20260715153753` — `staging_calculation_version_install_20260715`;
- `20260715153930` — `staging_calculation_version_grant_hardening_20260715`;
- `20260715155505` — `staging_calculation_version_fk_indexes_20260715`.

Active Edge Function:

- `leader-crm-calculations`;
- version `1`;
- status `ACTIVE`;
- `verify_jwt=true`;
- deployed source hash `5685a77b94f4cf742e3e14038b8d519fc13972a56553d134e6e8256815715780`.

## Transactional acceptance

Executed against staging:

- `supabase/staging-tests/20260715_calculation_version_acceptance.sql`;
- `supabase/staging-tests/20260715_calculation_version_safe_response.sql`.

Both scripts completed without raised exceptions and ended with `ROLLBACK`.

The main acceptance confirmed:

- next version allocation;
- new version status `Черновик`;
- commercial offer and order links are not inherited;
- server-side totals;
- item snapshot creation;
- source calculation immutability;
- idempotent replay;
- idempotency conflict detection;
- invalid negative-profit totals are rejected;
- failed commands do not create extra versions;
- a successful command receipt is created inside the transaction.

The safe-response acceptance confirmed:

- calculation response uses the explicit allowlist;
- item response uses the explicit allowlist;
- `created_by`, `updated_by`, `commercial_offer_id` and `order_id` are not returned;
- item `calculation_id` and `lead_id` are not returned;
- the idempotency receipt stores the same safe response;
- replay returns the same safe projection;
- `anon` and `authenticated` cannot execute the public or private persistence RPC;
- `service_role` can execute both required functions.

## Rollback evidence

A separate read-only check after both tests returned:

- fixture profiles: `0`;
- fixture leads: `0`;
- fixture needs: `0`;
- fixture calculations: `0`;
- fixture receipts: `0`.

No acceptance fixture remained in staging.

## Grants and indexes

Observed privileges on `public.leader_lead_calculations`:

- `service_role SELECT`: `true`;
- `service_role INSERT`: `true`;
- `service_role UPDATE`: `false`;
- `service_role DELETE`: `false`.

Observed function privileges:

- `service_role` can execute `public.leader_create_calculation_version_rpc(jsonb)`: `true`;
- `authenticated` can execute the wrapper: `false`.

Observed indexes:

- `leader_lead_calculations_need_id_idx`: present;
- `leader_lead_calculation_items_lead_id_idx`: present.

## Advisor result

Security advisor returned INFO-only `rls_enabled_no_policy` notices for deliberately closed staging/private tables, including the two calculation tables. Browser roles have no table grants and no RPC execute privilege, so no permissive policy was added merely to silence the advisor.

Performance advisor returned INFO-only `unused_index` notices. The calculation indexes are new and staging has no representative workload yet. They must not be removed based only on this fresh-project signal.

Remediation references:

- RLS enabled without policy: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Unused index: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Remaining gates

Staging database acceptance is complete. Remaining work before any production proposal:

1. authenticated staging Edge integration using permitted and denied test roles;
2. Network evidence that the Edge response matches the safe projection;
3. replay and stale-source checks through the HTTP boundary;
4. review of Edge logs and audit/receipt correlation;
5. a production-specific migration and rollback plan;
6. explicit production approval.

No production migration, data change, RLS change or Edge deployment was performed during this verification.
