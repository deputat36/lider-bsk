# Public lead retry coverage correction — 2026-07-10

Related: #200, #201, #210.

Status: resolved in source; manual browser proof remains required.

## Confirmed site-wide scope

Site-wide retry idempotency is implemented in `assets/public-lead-form.js`, which is shared by the public landing pages.

The shared module now provides:

- session-scoped pending `request_id`;
- same-payload retry using the same `request_id` after an ambiguous network failure;
- a 30-minute pending-state lifetime;
- Russian phone normalization so `+7...` and `8...` formats match by the final 10 digits;
- a privacy-minimized fingerprint that begins with `fnv1a-` instead of storing the raw phone or message;
- pending-state cleanup only after HTTP success and confirmed `data.ok === true`;
- correct duplicate wording and the server-returned request reference.

## Request page compatibility

`request.html` continues to load `assets/public-lead-reference-v1.js` before the shared form module.

The helper and the shared module use the same storage key, phone normalization and fingerprint algorithm. This preserves the existing request-page reference UI without allowing the helper to replace the shared pending ID with a different fingerprint.

## Verification

Automated verification:

- `node --check assets/public-lead-form.js`;
- `node --check assets/public-lead-reference-v1.js`;
- `node tools/test_public_lead_shared_retry.mjs`;
- `.github/workflows/public-lead-shared-retry-check.yml`.

The behavioral test confirms:

- same payload reuses the ID;
- changed payload creates a new ID;
- `+7` and `8` phone formats are equivalent;
- raw phone/message are not stored;
- expired pending state is not reused;
- helper and shared fingerprints match.

Manual verification is documented in:

`docs/PUBLIC_LEAD_SHARED_RETRY_MANUAL_TEST_2026-07-10.md`.

## Remaining evidence gap

Manual browser proof remains required on several real landing pages, including a simulated lost response followed by a successful retry and CRM trace verification.

This remaining evidence gap does not require a Supabase production change.

## Guardrails

- do not change Supabase production for this browser-source fix;
- keep `leader-public-lead v9` and its request/audit contract unchanged;
- keep the existing main request page guard active;
- no `nav_*` changes.
