# Public lead form cache bust — 2026-07-01

Scope: public site only.

Reason: `assets/public-lead-form.js` now contains new service options and presets for `Визитки` and `Полиграфия`, but some public pages still load it with `?v=4`.

Current status:

The safe short-page part of this task is mostly complete. Several public pages have already been moved to `assets/public-lead-form.js?v=5`, and the public helper includes both `Визитки` and `Полиграфия` options/presets.

Already covered by `v=5` or helper checks:

- `vizitki-borisoglebsk.html`;
- `poligrafiya-borisoglebsk.html`;
- `razdatochnye-materialy-borisoglebsk.html`;
- `reklamnye-posty-vk-borisoglebsk.html`;
- `audit-kart-yandex-2gis-borisoglebsk.html`;
- `uslugi.html`;
- `bannery-borisoglebsk.html`;
- `outdoor-advertising-borisoglebsk.html`;
- `reklama-otkrytiya-magazina-borisoglebsk.html`.

Remaining blocked pages:

- `request.html`;
- `index.html`;
- `pechat-bannerov-borisoglebsk.html`;
- `banner-dlya-magazina-borisoglebsk.html`;
- `oformlenie-vhoda-borisoglebsk.html`;
- `nakleyki-na-vitrinu-borisoglebsk.html`;
- `rezhim-raboty-tablichki-borisoglebsk.html`.

Why blocked:

These pages contain long inline CSS or are truncated through the connector. Full-file replacement through the connector is not safe. Continue through #191 and #195 by shortening one page at a time with a normal working copy or safe patch.

Guardrail:

Blocked pages should remain on `assets/public-lead-form.js?v=4` until their repeated CSS is migrated and the page is safely readable. Moving them to `v=5` before that would hide the real blocker and could make workflow expectations inconsistent.

Required next patch:

1. Convert one blocked page at a time to shared `assets/public-landing.css`.
2. After the page is shortened and readable, replace its public form script from `assets/public-lead-form.js?v=4` to `assets/public-lead-form.js?v=5`.
3. Include public HTML pages only at repository root.
4. Do not touch CRM, nav, Supabase functions or database migrations.
5. Update workflow expectations that currently assert `assets/public-lead-form.js?v=4` only after `request.html` is safely migrated.
6. Run public-site audit checks after each patch.

Known workflow location:

- `.github/workflows/public-site-audit-check.yml` checks request page script order and still expects `assets/public-lead-form.js?v=4` for `request.html` until that page is safely migrated.

Related issues: #185, #191, #195.

Supabase production: no changes required.
