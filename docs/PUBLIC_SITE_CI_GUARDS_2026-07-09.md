# Public site CI guards

2026-07-09

Scope:
- public site: https://www.lider-bsk.ru;
- repository: deputat36/lider-bsk;
- Supabase project: ofewxuqfjhamgerwzull;
- public lead function: leader-public-lead.

Main guards:
- `.github/workflows/public-site-audit-check.yml` checks robots, sitemap, public lead form contract, request page script order, homepage helper contract and public JS syntax;
- `.github/workflows/public-no-secret-markers-check.yml` checks public root HTML and top-level `assets/*.js` / `assets/*.css` for service markers.

Protected contracts:
- public form endpoint must stay on `leader-public-lead`;
- public form must not point to `parket-public-lead`, `broker-public-lead` or `nav-v2-deal-api`;
- public sitemap must not include CRM/nav contour URLs;
- homepage helper must stay connected after the public lead form script;
- public assets must not contain service-role or private-key markers.

Open tail:
- update cache version for `assets/packages-link.js` in `index.html` when a safe small edit path is available.
