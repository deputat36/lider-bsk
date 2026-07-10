# Supabase development branch acceptance plan — CRM hardening

Date: 2026-07-10.

Related: #200, #201, #202, #204, #214, #217, #219.

Scope: only RA Lider `leader_*`, `leader-*`, CRM v4 and the public website intake.

`nav_*`, Parket and Broker objects are out of scope.

Mode: plan, source contract and read-only production verification only. No development branch was created, no cost was confirmed, and no production migration, DML, Edge deploy, RLS, grant, Auth or Storage change was made.

## Purpose

Create one reproducible acceptance process for four approval-gated tracks:

1. protected public intake;
2. server-side RBAC and field projections;
3. transaction-backed CRM actions;
4. persistent acts of completed work.

The development branch is a disposable verification environment. Passing branch tests does not authorize a production merge or deploy.

## Current production baseline

Supabase project:

`ofewxuqfjhamgerwzull`

Project status observed read-only:

- `ACTIVE_HEALTHY`;
- region `eu-west-1`;
- PostgreSQL `17.6.1.121`.

Known live Edge Function baseline:

- `leader-public-lead` — ACTIVE v9, `verify_jwt=false`;
- `leader-crm-leads` — ACTIVE v12, `verify_jwt=true`;
- `leader-crm-orders` — ACTIVE v2, `verify_jwt=true`.

Before any branch work, re-read versions and SHA values. GitHub source is not proof of deployment.

The connector branch-list request returned a permission-validation error on 2026-07-10. Branch existence is therefore not confirmed by this snapshot and must be checked again before creation.

## Cost and approval prerequisites

Before creating a Supabase branch:

1. confirm the target organization ID;
2. call the Supabase branch cost estimator;
3. show the recurring amount to the user;
4. obtain explicit cost confirmation;
5. only then call branch creation;
6. record branch ID, project ref, region, creation time and responsible person.

Never create a paid branch based only on this document.

## Production baseline evidence package

Capture immediately before branch creation:

- production project status;
- migration list and latest migration version;
- `leader_*` table inventory;
- RLS/policy/grant snapshot;
- relevant function definitions and execute grants;
- Edge Function versions, verify_jwt and SHA;
- security and performance advisors;
- representative aggregate counts without PII;
- GitHub main commit SHA;
- open approval-gated issues.

Store no secrets, JWTs, raw passwords or production personal data in GitHub evidence.

## Test identities

Use synthetic accounts only, for example under an invalid/test-controlled domain.

Required roles:

- owner;
- admin;
- manager;
- accountant;
- designer;
- installer;
- contractor;
- one inactive profile;
- one authenticated user without a profile;
- one profile with an unknown role.

Each account must have a unique test purpose. Do not reuse production staff accounts.

## Synthetic fixtures

Create only synthetic branch data:

- public lead with request ID and UTM fields;
- suspicious honeypot request;
- rejected incomplete request;
- duplicate request;
- client;
- need below 80% and completed need;
- catalog-backed calculation item;
- commercial offer;
- order with several client-facing items;
- payment and expense;
- design task;
- production job;
- installation job;
- act draft and generated document.

Use recognisable test prefixes such as `TEST-BRANCH-` and non-real phone numbers permitted by the test environment.

## Track A — protected public intake (#201)

Candidate architecture:

`browser → leader-public-lead → backend credential → leader_leads + leader_public_lead_audit`

Branch prerequisites:

- candidate Edge Function uses a backend-only secret/service credential;
- browser assets contain no secret;
- public direct INSERT grants/policies are removed only in the branch;
- rate limiter is configured with privacy-safe identifiers;
- retry with the same request ID is not blocked.

### Positive tests

- allowed origin and valid payload create one lead;
- accepted audit row is written;
- response, lead and audit use the same request ID;
- phone normalization is correct;
- UTM and source page path are preserved;
- legitimate same-ID retry returns `duplicate=true` and creates no second lead.

### Negative tests

- direct anon/browser REST insert into `leader_leads` is denied;
- direct anon/browser REST insert into `leader_public_lead_audit` is denied;
- disallowed origin is rejected;
- oversized payload is rejected;
- missing phone and message is rejected;
- honeypot creates no lead;
- malformed JSON is rejected;
- rate-limit threshold is enforced;
- error response does not reveal credentials or internal SQL details.

### Concurrency tests

Send concurrent requests with the same request ID.

Expected result:

- exactly one lead;
- duplicate/audit evidence for additional attempts;
- no partial lead without audit evidence;
- no raw IP storage.

## Track B — server-side RBAC (#202)

Source contract:

- `crm/v4/assets/v4/action-permissions-v1.js`;
- `docs/CRM_SERVER_ACTION_RBAC_SPEC_2026-07-10.md`.

### Profile bootstrap tests

- authenticated user without profile receives only own pending profile;
- new profile is `manager`, inactive;
- caller cannot set role or activate self;
- caller cannot bootstrap another user;
- inactive profile cannot access business actions.

### Role matrix tests

For every Edge action, test every canonical role.

Required examples:

- manager reads/creates/updates leads but cannot change payment status;
- accountant reads approved finance/order projection but cannot read leads or create orders;
- designer cannot use generic orders endpoint;
- installer cannot use production job endpoint;
- contractor cannot use installation job endpoint;
- unknown role fails closed;
- owner/admin execute approved administrative actions.

### Field projection tests

Verify Network/JSON payloads, not only hidden UI:

- manager response excludes cost, profit, internal finance fields and full order JSON;
- accountant response excludes lead payload and production/design internal comments;
- designer/installer/contractor receive only job-specific fields;
- denied action triggers no service-role REST/RPC business request.

### Permission drift tests

Compare server action map with browser canonical actions.

The test fails if:

- an Edge action has no canonical permission;
- a canonical role is omitted;
- a deprecated role such as `production` grants access;
- an unknown action is routed to a default privileged handler.

## Track C — transaction-backed actions (#204, #217)

Priority commands:

- `calculation.save`;
- `offer.create_from_calculation`;
- `offer.transition`;
- `order.create`;
- `order.transition`;
- `production_job.update`;
- `installation_job.update`;
- `lead.assign`;
- `lead.transition`;
- `document.create_act`.

Use canonical status contract:

`crm/v4/assets/v4/status-transitions-v1.js`

### Atomicity tests

For each command, force a failure at every internal step.

Expected result:

- no partial child rows;
- no status advance without required entity creation;
- no audit event claiming success after rollback;
- no orphan order item, offer item, production event or document snapshot.

### Idempotency tests

Repeat the same command with the same idempotency key.

Expected result:

- one business result;
- stable response reference;
- no duplicate order, offer, payment, production event or document number.

### Stale-write tests

Send an expected current status that no longer matches the row.

Expected result:

- conflict/rejected transition;
- no overwrite;
- current canonical status returned safely;
- audit evidence for rejected stale action when appropriate.

### Status-transition tests

- allowed transitions pass;
- forbidden transitions fail;
- terminal statuses cannot reopen without an explicitly versioned flow;
- permission is resolved from the target transition;
- status, timestamp and audit event commit in one transaction.

## Track D — persistent acts of completed work (#214)

Candidate model:

- `leader_order_documents`;
- immutable/versioned JSON snapshot;
- optional document item table only if justified;
- private Storage reference for generated PDF;
- server command `document.create_act`;
- unique number `АВР-YYYY-NNNN`.

### Creation tests

- order/client/items are loaded server-side;
- client-facing prices only;
- no contractor cost, profit or internal comments in snapshot/PDF;
- missing order/client/items produce clear validation error;
- unfinished order/production/installation produces warnings according to approved business rule;
- creating preview does not mark order paid or completed.

### Numbering and concurrency tests

- parallel act creation produces unique sequential numbers;
- retry with same idempotency key returns the same act;
- voided number is not silently reused;
- production number is assigned server-side only.

### Version tests

- draft can be edited according to permission;
- generated document creates immutable version snapshot;
- new version does not overwrite signed version;
- signed document cannot be edited;
- void requires `documents.void`, reason and audit event.

### Role tests

- owner/admin: full approved lifecycle;
- manager: read/create/update/generate/send;
- accountant: read/generate/send/sign according to approved matrix;
- designer/installer/contractor: denied;
- unknown/inactive role: denied.

### Storage/PDF tests

- PDF is private by default;
- signed URLs expire;
- bucket path cannot be guessed to bypass authorization;
- Cyrillic fonts render correctly;
- multi-page item table repeats header;
- no internal CRM controls appear in print;
- file hash and snapshot version are recorded.

## Audit and observability evidence

For every test run record:

- branch project ref;
- GitHub commit SHA;
- migration version;
- deployed Edge version/SHA;
- synthetic actor role;
- action/domain;
- request/idempotency ID;
- expected and actual HTTP/result;
- affected synthetic row IDs;
- audit event ID;
- rollback result;
- redacted logs/screenshots where useful.

Do not commit access tokens, cookies, Authorization headers, service keys or real personal data.

## Advisor and schema checks

After branch migrations/deploys:

- run security advisors;
- run performance advisors;
- verify RLS enabled on new tables;
- verify public grants are absent where required;
- verify SECURITY DEFINER execute grants;
- verify indexes supporting unique number/idempotency constraints;
- generate TypeScript types;
- compare branch schema with intended migration.

Warnings must be classified as:

- blocker;
- accepted with written rationale;
- unrelated/out of scope.

## Rollback rehearsal

Before production approval, rehearse rollback in the development branch:

1. restore previous Edge version behavior;
2. reverse or disable candidate command path;
3. restore branch grants/policies only from reviewed rollback migration;
4. verify public form and CRM return to baseline behavior;
5. prove synthetic data consistency;
6. record rollback duration and evidence.

Never improvise production rollback after deployment.

## Exit criteria

Branch acceptance is complete only when:

- all positive tests pass;
- all negative tests fail safely;
- concurrent/idempotent tests pass;
- field projections contain no forbidden fields;
- no secrets appear in browser or logs;
- audit and rollback evidence is complete;
- advisors have no unexplained `leader_*` blocker;
- GitHub source SHA and branch deployed SHA are recorded;
- #201/#202/#204/#214 acceptance checklists are updated.

## Production approval gate

Passing this plan does not authorize production changes.

Before production:

1. present branch evidence and remaining risks;
2. re-read production baseline for drift;
3. prepare exact deployment order;
4. prepare exact rollback order;
5. obtain explicit production approval;
6. apply only the approved migration/function versions;
7. run immediate smoke tests;
8. monitor logs and audit rows;
9. stop and rollback on predefined failure conditions.

No `nav_*` change is permitted at any step.
