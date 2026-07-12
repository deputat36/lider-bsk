# Public landing CSS migration

Scope: public site only.

Current state:

- `assets/public-landing.css` is the shared style foundation for public landing pages.
- `tools/check_public_landing_css.py` validates the base markers of that stylesheet.
- `.github/workflows/public-site-audit-check.yml` runs the stylesheet checker.
- Migration is gradual: one readable public page per PR, without full replacement of large truncated files.
- `kak-prohodit-zakaz.html` was migrated on 2026-07-12: shared foundation connected, repeated base CSS removed, local process styles retained, lead form updated to `v=5`.
- The public lead form helper contains the Polygraphy page preset and select option; this is covered by `tools/check_public_poligrafiya_service.py`.

Why this is needed:

Large public landing pages contain long inline CSS. Some of them are truncated when read through the connector, so full-file edits are risky.

Current migration backlog:

- `request.html`;
- `index.html`;
- `pechat-bannerov-borisoglebsk.html`;
- `banner-dlya-magazina-borisoglebsk.html`;
- `oformlenie-vhoda-borisoglebsk.html`;
- `nakleyki-na-vitrinu-borisoglebsk.html`;
- `rezhim-raboty-tablichki-borisoglebsk.html`.

Safe migration order:

1. Move repeated landing-page styles into `assets/public-landing.css`.
2. Convert one public landing page at a time.
3. Keep unique content and small page-specific rules in the HTML only when needed.
4. After a page is safely shortened, update its public lead form script to the latest cache-busting version.
5. Add the page to shared v5/SEO coverage and a focused migration checker.
6. Do not touch CRM, nav, Supabase functions or database migrations.

Related issues: #185, #191.
