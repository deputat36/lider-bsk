# Calculation version staging tests

Canonical environment: Supabase project `otulfnouybahfnsycxqn` (`lider-bsk-staging`).

The production project must never be used for these scripts.

## Canonical clean-staging order

1. Apply `supabase/staging-migrations/20260715_04_calculation_version_install.sql`.
2. Immediately apply `supabase/staging-migrations/20260715_05_calculation_version_grant_hardening.sql`.
3. Apply `supabase/staging-migrations/20260715_06_calculation_version_fk_indexes.sql`.
4. Run `supabase/staging-tests/20260715_calculation_version_acceptance.sql`.
5. Run `supabase/staging-tests/20260715_calculation_version_safe_response.sql`.
6. Run Supabase security and performance advisors.
7. Verify `leader-crm-calculations` is deployed with `verify_jwt=true` only after the database checks pass.

Migrations `20260715_02` and `20260715_03` are retained as design and patch history. They are not applied on a clean staging environment when canonical migration 04 is used.

Some acceptance SQL header comments were authored before migration 04 became canonical and still mention 02/03. This README and `docs/SUPABASE_STAGING_CALCULATION_VERSION_INSTALL_2026-07-15.md` are the current operator source of truth.

## Transaction boundary

Both acceptance scripts:

- require the exact staging environment guard;
- start with `BEGIN`;
- create deterministic fixtures only inside the transaction;
- raise an exception on contract drift;
- end with `ROLLBACK`;
- must leave zero fixture profiles, leads, needs, calculations and receipts.

The scripts are validation tools, not data seeders.

## Approval boundary

Passing staging acceptance does not authorize production migration or Edge deployment. Production rollout remains a separate explicit approval gate with its own migration plan, rollback and authenticated integration evidence.
