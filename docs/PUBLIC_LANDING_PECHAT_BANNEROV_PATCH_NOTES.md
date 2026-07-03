# Pechat bannerov landing patch notes

Scope: public site only.

Related issues: #185, #191, #195.

Target file: `pechat-bannerov-borisoglebsk.html`.

Why these notes exist:

The page has long inline CSS. Direct full-file replacement through the connector was blocked, so the next implementation should be done in a normal working copy or with a safe patch command.

Required changes:

1. Add shared stylesheet in the page head:
   - `assets/public-landing.css`
2. Remove the repeated landing-page inline CSS that is already covered by the shared stylesheet.
3. Keep all page content sections, FAQ, related links, footer and JSON-LD.
4. Keep the local service prefill logic and the service value `Баннер`.
5. After the HTML is shortened and readable, update the public lead form script from `v=4` to `v=5`.

Concrete safe replacements:

- In the head, keep `assets/public-lead-form.css?v=4` and add `assets/public-landing.css` before it.
- Remove the large `<style>...</style>` block only after confirming the shared CSS covers the landing classes used on the page.
- In the footer scripts, replace `assets/public-lead-form.js?v=4` with `assets/public-lead-form.js?v=5`.
- Do not remove the inline prefill script that sets `service.value='Баннер'`.

Do not change:

- CRM files;
- nav files;
- Supabase Edge Functions;
- Supabase database schema or data.

Verification:

- page title, description and canonical are preserved;
- JSON-LD remains present;
- lead form block remains present;
- local prefill still sets service to `Баннер`;
- final page uses `assets/public-lead-form.js?v=5`.
