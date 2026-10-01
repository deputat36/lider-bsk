# Supabase staging dependency inventory — 2026-10-01

This inventory is read-only evidence for the safe retirement plan of `lider-bsk-staging`.

## Exact staging project ref

`otulfnouybahfnsycxqn`

## Repository reference counts

Direct code-search references to the staging project ref currently include:

- 13 GitHub workflow files
- 97 files under `tools/`
- 15 files under `crm/v4/`
- 85 files under `supabase/`
- 58 files under `docs/`

These counts include static checks, historical documentation and runtime dependencies. They must not be interpreted as 268 independent live dependencies.

## GitHub workflows with direct cloud staging calls

The following workflows contain the cloud staging URL and therefore must be migrated or retired before the cloud project can be paused:

1. `.github/workflows/crm-staging-authenticated-e2e.yml`
2. `.github/workflows/crm-staging-lead-workflow-authenticated-ui-smoke-runtime.yml`
3. `.github/workflows/crm-staging-catalog-authenticated-e2e.yml`
4. `.github/workflows/crm-staging-installation-authenticated-ui-smoke-runtime.yml`

The public-intake staging runtime smoke also reaches the staging environment indirectly through its runner and must be included in the migration scope even when the workflow file itself does not contain the project ref.

## Workflows that reference staging but appear primarily static/source-validation oriented

These must still be reviewed, but they are not direct evidence that the cloud Supabase project is required at runtime:

- `.github/workflows/crm-design-task-staging-check.yml`
- `.github/workflows/crm-design-read-path-check.yml`
- `.github/workflows/crm-design-post-cleanup-snapshot-check.yml`
- `.github/workflows/crm-design-fixture-sql-bundle-check.yml`
- `.github/workflows/crm-design-profile-probe-sql-bundle-check.yml`
- `.github/workflows/crm-catalog-production-candidate-check.yml`

The following design E2E/stale-probe checks contain staging runtime-oriented tooling but no direct hard-coded cloud URL in the workflow file; their called scripts must be inspected before classification:

- `.github/workflows/crm-design-auth-e2e-kit-check.yml`
- `.github/workflows/crm-design-auth-e2e-v2-check.yml`
- `.github/workflows/crm-design-stale-order-probe-check.yml`

## Current local Supabase readiness

The repository currently has no existing GitHub workflow using:
- `supabase/setup-cli`
- `supabase start`
- `npx supabase`

Therefore there is no established local-Supabase CI path to switch to yet.

The current `supabase/config.toml` is production-oriented and uses:

`project_id = "ofewxuqfjhamgerwzull"`

A new local/ephemeral staging configuration must be introduced without changing the production contract.

## Cloud staging observations

- project status: `ACTIVE_HEALTHY`
- no Auth users persisted in staging at the inspected checkpoint
- recent inspected 24-hour log window contained PgBouncer/Postgres activity but no Edge Function activity
- absence of recent Edge traffic does not make the project safe to pause because GitHub workflows remain configured to use it
- staging security/performance advisories remain informational inputs only; no advisor-driven schema changes are part of this migration phase

## Safe migration rule

Do not replace hard-coded staging refs globally.

Each runtime dependency should be moved to an explicit environment contract so the same runner can target either:
1. current cloud staging; or
2. local ephemeral Supabase.

During transition, cloud staging remains the fallback.

## Next implementation step

Build a shadow local-Supabase CI path that is:
- non-blocking;
- manually dispatchable at first;
- isolated from production;
- based on synthetic data only;
- capable of proving schema reconstruction before any existing cloud workflow is changed.
