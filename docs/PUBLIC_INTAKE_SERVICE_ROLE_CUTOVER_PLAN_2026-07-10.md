# Public intake protected cutover plan — 2026-07-10

Related: #200, #201.

Supabase project: `ofewxuqfjhamgerwzull`.

Mode: design and source plan only. No production Edge deploy, DDL, RLS, grants or data changes were made.

## Current state

`leader-public-lead` currently writes to PostgREST with `SUPABASE_ANON_KEY`.

Production grants/policies currently allow the public write path:

- `anon INSERT` on `public.leader_leads`;
- policy `leader_leads_insert_public_safe` for `anon, authenticated`;
- `anon INSERT` on `public.leader_public_lead_audit`;
- policy `leader_public_lead_audit_insert_public` for `anon`.

The policies limit payload shape but do not guarantee that writes pass through the Edge Function.

Therefore a direct API write can bypass Edge-only controls:

- origin allowlist;
- honeypot handling;
- server phone normalization;
- unified accepted/duplicate/suspicious/rejected/error audit sequence.

## Official Supabase basis

Supabase Edge Functions have backend secret credentials available through environment variables.

Preferred modern key:

- `SUPABASE_SECRET_KEYS` → named secret key, for example `default`.

Legacy transition key:

- `SUPABASE_SERVICE_ROLE_KEY`.

Both are backend-only and bypass RLS. They must never be placed in browser code or committed to Git.

Official references:

- `https://supabase.com/docs/guides/functions/secrets`;
- `https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys`;
- `https://supabase.com/docs/guides/database/postgres/row-level-security`.

## Target architecture

Browser:

`public-lead-form.js → leader-public-lead`

Controlled backend write:

`leader-public-lead → backend secret credential → leader_leads + leader_public_lead_audit`

Database:

- no public INSERT grant/policy on the two intake tables;
- authenticated CRM reads/writes remain governed by their separate staff policies;
- browser never receives a secret/service credential.

## Source change design

Create one helper inside `leader-public-lead`:

1. Try `SUPABASE_SECRET_KEYS` and read the `default` key.
2. Fall back to `SUPABASE_SERVICE_ROLE_KEY` only during legacy transition.
3. For a modern secret key, send it in the `apikey` header only.
4. For the legacy service-role JWT, use `apikey` plus `Authorization: Bearer ...`.
5. Use the same backend headers for both lead and audit writes.
6. Fail closed with `server_not_configured` if no backend credential exists.
7. Never log the credential or complete request payload.

`leader-public-lead` remains `verify_jwt=false` because it is a public browser endpoint; authorization is implemented by origin/method/payload/abuse controls and the backend credential remains internal.

## Database cutover draft

The database operation must be applied only after the candidate Edge Function is proven on a development branch.

Expected migration intent:

```sql
begin;

revoke insert on table public.leader_leads from anon;
revoke insert on table public.leader_public_lead_audit from anon;

drop policy if exists leader_leads_insert_public_safe
  on public.leader_leads;

drop policy if exists leader_public_lead_audit_insert_public
  on public.leader_public_lead_audit;

commit;
```

Before applying, re-read live grants and policy names. Do not assume the snapshot is unchanged.

## Required rate-limit design

Before production cutover choose and test an abuse-control strategy.

Minimum counters:

- request count by privacy-safe IP hash and short time window;
- request count by normalized phone and short time window;
- duplicate request ID count;
- suspicious honeypot count;
- payload-size rejection count.

The limiter must not block a legitimate retry with the same `request_id`.

Do not store raw IP addresses.

## Development-branch test matrix

### Accepted

- allowed origin;
- valid phone/message;
- one lead row;
- one accepted audit row;
- same request ID in response, lead and audit.

### Duplicate

- repeat the same request ID;
- no second lead;
- duplicate audit row;
- response `ok=true`, `duplicate=true`.

### Suspicious

- honeypot filled;
- no lead row;
- suspicious audit row;
- public response remains non-revealing.

### Rejected

- missing phone and message;
- no lead row;
- rejected audit row;
- HTTP 400.

### Direct write

- browser/public credential direct insert to both tables is denied after migration.

### CRM regression

- active staff can still read/update leads according to staff permissions;
- public audit remains readable only to approved roles;
- CRM request trace continues to work.

## Deployment order

1. Create/rebase Supabase development branch.
2. Deploy candidate Edge Function to branch.
3. Verify candidate uses backend credential.
4. Apply branch migration removing public inserts.
5. Run the full test matrix.
6. Record evidence and rollback result.
7. Obtain explicit production approval.
8. Deploy Edge candidate and migration in the agreed maintenance sequence.
9. Immediately submit a real browser test request.
10. Re-run security advisors and live grants/policies inspection.

## Rollback

Rollback must be prepared before production changes:

1. Restore the previous Edge Function version if backend writes fail.
2. Restore narrowly scoped public INSERT grants/policies only if required to recover intake.
3. Keep request/audit evidence for the failed interval.
4. Do not leave the database in a mixed state where Edge uses public credentials but public grants are removed.

## Acceptance criteria

- the website creates accepted leads through the Edge Function;
- public direct table inserts are denied;
- accepted, duplicate, suspicious, rejected and error events remain traceable;
- retry idempotency keeps one lead and one request reference;
- no backend credential appears in GitHub or browser assets;
- CRM staff workflows continue to work;
- production evidence and rollback evidence are documented.

## Guardrails

- no production change without explicit approval;
- no secret values in source or docs;
- no `nav_*` changes;
- no historical lead rewrite;
- no isolated grant/policy change without the matching Edge cutover.
