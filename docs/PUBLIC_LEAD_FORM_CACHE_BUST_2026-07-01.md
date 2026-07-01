# Public lead form cache bust — 2026-07-01

Scope: public site only.

Reason: `assets/public-lead-form.js` now contains new service options and presets for `Визитки` and `Полиграфия`, but many public pages still load it with `?v=4`.

Required next patch:

1. Replace public page script references from `assets/public-lead-form.js?v=4` to `assets/public-lead-form.js?v=5`.
2. Include public HTML pages only at repository root.
3. Do not touch CRM, nav, Supabase functions or database migrations.
4. Update workflow expectations that currently assert `assets/public-lead-form.js?v=4`.
5. Run public-site audit checks after the patch.

Known workflow location:

- `.github/workflows/public-site-audit-check.yml` checks request page script order and currently expects `assets/public-lead-form.js?v=4`.

Related issue: #185.

Supabase production: no changes required.
