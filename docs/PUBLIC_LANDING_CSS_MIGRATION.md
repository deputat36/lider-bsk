# Public landing CSS migration

Scope: public site only.

Current state:

- `assets/public-landing.css` is prepared as a shared style foundation for public landing pages.
- `tools/check_public_landing_css.py` validates the base markers of that stylesheet.
- `.github/workflows/public-site-audit-check.yml` runs the stylesheet checker.
- Public HTML pages are not expected to be fully migrated yet; the stylesheet is a foundation for the next safe conversion pass.

Why this is needed:

Large public landing pages contain long inline CSS. Some of them are truncated when read through the connector, so full-file edits are risky.

Safe migration order:

1. Move repeated landing-page styles into `assets/public-landing.css`.
2. Convert one public landing page at a time.
3. Keep unique content and small page-specific rules in the HTML only when needed.
4. After a page is safely shortened, update its public lead form script to the latest cache-busting version.
5. Do not touch CRM, nav, Supabase functions or database migrations.

Related issues: #185, #191.
