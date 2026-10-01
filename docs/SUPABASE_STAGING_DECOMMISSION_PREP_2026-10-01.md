# Supabase staging decommission preparation — 2026-10-01

## Scope

This document prepares a safe migration away from the dedicated cloud staging project without changing production or pausing/deleting any Supabase project.

Production project:
- `ofewxuqfjhamgerwzull`

Current cloud staging project:
- `otulfnouybahfnsycxqn`

## Safety rules

1. Do not change production schema, RLS, Auth, Edge Functions, keys, or data as part of this phase.
2. Do not pause or delete `lider-bsk-staging` until all exit gates below are satisfied.
3. Keep existing cloud-staging workflows operational while a replacement local/ephemeral CI path is developed.
4. New CI work must be introduced in parallel first, then compared with the current cloud-staging path.
5. Any destructive Supabase action requires separate explicit approval.

## Current verified state

- Both Supabase projects are `ACTIVE_HEALTHY`.
- Cloud staging contains a dedicated CRM test harness, staging-only tables/RPCs and multiple Edge Functions.
- Recent staging logs showed no Edge Function traffic in the inspected 24-hour window, but this does not prove the project is unused.
- GitHub still contains many references to the staging project ref `otulfnouybahfnsycxqn`.
- The authenticated CRM E2E workflow directly calls:
  - `https://otulfnouybahfnsycxqn.supabase.co`
  - `leader-staging-authenticated-e2e-bootstrap`
- The catalog authenticated E2E and public-intake runtime smoke also depend on the cloud staging environment.
- Therefore the staging project must not be paused yet.

## Migration-history risk

The database migration registry for cloud staging and the current repository staging migration set are not guaranteed to be a 1:1 reconstructive history.

Before replacing cloud staging, local/ephemeral CI must prove that the repository can deterministically build the required staging schema and functions from scratch.

## Target architecture

```
GitHub Actions
  -> ephemeral/local Supabase stack
     -> staging schema/functions
     -> synthetic Auth user + fixture
     -> browser/API E2E
     -> cleanup
     -> stack destroyed
```

Cloud staging remains available during the transition.

## Work plan

### Phase A — inventory and reconstruction proof

- Map every workflow/tool/frontend reference to the staging project ref.
- Classify each reference as:
  - runtime dependency;
  - deployment helper;
  - static validation;
  - documentation/history.
- Reconcile cloud staging migration history with repository SQL.
- Identify the minimum deterministic migration sequence required to bootstrap staging locally.
- Verify required Edge Function sources exist in the repository.

### Phase B — shadow local CI

Create a new, non-blocking workflow that:
- starts Supabase locally/ephemerally;
- applies the staging schema;
- serves the required staging Edge Functions;
- creates only synthetic test data;
- runs a representative E2E path;
- always cleans up;
- never connects to production.

The existing cloud-staging workflow remains unchanged.

### Phase C — parity

Compare cloud staging and local CI for:
- Auth lifecycle;
- RBAC;
- lead workflow;
- calculations;
- offers;
- orders;
- design;
- production;
- installation;
- finance;
- catalog;
- public lead intake;
- cleanup residue.

Local CI is not considered a replacement until the same required contracts pass.

### Phase D — cutover

Only after parity:
- switch CI jobs from cloud staging to local ephemeral Supabase;
- keep the cloud staging project active for a short observation period;
- verify no required workflow references the cloud staging ref at runtime.

### Phase E — pause gate

The cloud staging project may be considered for pausing only when all of these are true:

- [ ] Full logical backup exists outside the project.
- [ ] Current Edge Function source is preserved in Git.
- [ ] Migration/bootstrap path is reproducible locally.
- [ ] Required E2E tests pass on local Supabase.
- [ ] No active CI workflow requires `otulfnouybahfnsycxqn`.
- [ ] Production remains untouched and healthy.
- [ ] Explicit owner approval is received.

Deletion is a separate later decision and is not part of this plan.

## Known staging advisories

Current staging advisories include:
- tables with RLS enabled but no policies where fail-closed/service-role-only behavior may be intentional;
- one authenticated-executable `SECURITY DEFINER` function that requires intent review;
- unused-index notices that must not be treated as automatic deletion candidates.

These are not being changed during the staging migration preparation phase.

## Rollback principle

At every stage the rollback is: keep or restore the current cloud-staging workflow path. No production rollback should be necessary because production is outside this migration scope.


## Progress evidence — 2026-10-01

A branch-only shadow reconstruction workflow now exists at:

`.github/workflows/supabase-staging-local-reconstruction-shadow.yml`

The workflow has no production credentials, never links to a hosted project, and refuses staging migration input containing the production project ref.

### Proven clean install

GitHub Actions run #6 completed successfully and proved that the core hosted staging database can be reconstructed into an isolated local Supabase stack from repository sources plus explicitly documented local-only reconstruction layers.

Successful run:
- workflow run: `36850978122`;
- conclusion: `success`;
- staging guard verification: passed;
- production changes: none;
- hosted staging changes: none.

### Migration-history gaps discovered safely

The hosted staging migration registry is not represented by one canonical Git directory.

Verified sources are split across:
- `supabase/staging-migrations/`;
- `supabase/staging/`;
- historical state that is no longer present as original migration files.

The reconstruction therefore explicitly:
- excludes rollback scripts;
- excludes source-only calculation candidates superseded by the clean-install migration;
- includes the three real compatibility migrations under `supabase/staging/`;
- restores the pre-existing `public.rls_auto_enable()` event-trigger baseline locally;
- reconstructs the missing 2026-07-18 commercial-offer block locally from hosted staging metadata and the current RPC, reversed to its pre-privacy form so the committed 2026-09-07 privacy migration can replay normally;
- intentionally does not reproduce the temporary 2026-07-22 installation-read experiment because the following committed reconcile migration explicitly restores the exact main definition.

### Public-intake rate limit

The hosted staging history also contains a public-intake rate-limit migration plus an execute-revoke/restore rehearsal.

The reviewed SQL source already exists in:
`supabase/production-candidates/20260724_02_public_intake_rate_limit_candidate.sql`.

The shadow CI is being extended to reuse this source only inside the ephemeral local database, after adding a staging environment guard. The production candidate is not being deployed or copied into production migrations.

### Current stop condition

The cloud staging project must remain active.

A successful database reconstruction alone is not sufficient to pause it. Required next proofs are:
1. database schema/function/policy/index parity;
2. local Auth lifecycle;
3. required staging Edge Functions;
4. representative authenticated browser/API E2E;
5. migration of active cloud-staging GitHub workflows;
6. a final backup;
7. explicit owner approval.
