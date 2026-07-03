# Public landing first page migration

Scope: public site only.

Related issues: #185, #191, #195.

Recommended first candidate: `pechat-bannerov-borisoglebsk.html`.

Why this page first:

- it is one of the remaining pages that still needs the public lead form cache-bust;
- it uses the same landing structure as other large outdoor advertising pages;
- after successful conversion, the same pattern can be reused for banner, stickers and working-hours pages.

Safe conversion checklist:

1. Add `assets/public-landing.css` to the page head.
2. Remove only repeated landing CSS that is already covered by the shared file.
3. Keep page-specific content, JSON-LD, form block and local service prefill logic.
4. Change `assets/public-lead-form.js?v=4` to `assets/public-lead-form.js?v=5` only after the page is shortened and readable.
5. Verify that the service prefill remains `Баннер`.
6. Do not touch CRM, nav, Supabase functions or database migrations.

Manual verification after conversion:

- the page opens without layout breakage on desktop and mobile;
- the lead form renders;
- the form submits to `leader-public-lead`;
- the service value is `Баннер`;
- the page keeps canonical, title, description and JSON-LD.
