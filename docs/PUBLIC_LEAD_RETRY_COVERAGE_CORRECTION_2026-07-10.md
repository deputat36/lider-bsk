# Public lead retry coverage correction — 2026-07-10

Related: #200, #201, #210.

## Confirmed scope

The source-only retry idempotency implemented in `assets/public-lead-reference-v1.js` is currently guaranteed on the main request page where that helper is loaded:

`request.html`.

It provides:

- session-scoped pending request ID;
- same-payload retry using the same `request_id`;
- correct duplicate response wording;
- visible request reference after success.

## Remaining site-wide gap

`assets/public-lead-form.js` is shared by many public landing pages.

The shared module currently generates a fresh `request_id` for each submit attempt. Landing pages that do not load `public-lead-reference-v1.js` therefore do not yet have guaranteed retry idempotency after an ambiguous network failure.

This does not affect ordinary successful submissions. The gap concerns this sequence:

1. the server records the lead;
2. the browser loses or cannot read the response;
3. the user submits the same form again;
4. the shared form generates another request ID.

## Required fix

Move the pending fingerprint/request-ID lifecycle into the shared `public-lead-form.js` so it applies to every public form.

The implementation must:

- preserve the same request ID for the same session-scoped payload retry;
- clear pending state only after an `ok=true` response;
- retain the server-returned request reference;
- distinguish duplicate from newly accepted response;
- avoid persistent storage of raw personal data;
- pass `node --check` and browser tests on several landing pages.

## Current execution decision

The shared form contains a large preset registry and many unrelated UI helpers. The available GitHub connector does not support safe line-level patches.

A manual full-file rewrite would create an unacceptable risk of losing presets or unrelated functionality.

Therefore the site-wide change is tracked in #210 for a normal working-copy/PR patch.

## Guardrails

- do not claim site-wide retry coverage until #210 is verified;
- do not change Supabase production for this browser-source fix;
- keep the existing main request page guard active;
- no `nav_*` changes.
