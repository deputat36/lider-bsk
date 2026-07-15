# CRM lead analytics badges manual test — 2026-07-09

Scope: RA Lider CRM v4 lead list.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

Related issues: #196, #197, #198, #199.

## What was implemented

GitHub source now contains a derived analytics UI layer for lead cards, a small aggregate summary and derived-category search support:

- `crm/v4/assets/v4/lead-analytics-normalization.js` derives normalized service/source categories.
- `crm/v4/assets/v4/lead-analytics-badges-v1.js` adds visual badges to rendered lead cards.
- `crm/v4/assets/v4/lead-analytics-summary-v1.js` adds an aggregate summary block for normalized services and sources. Summary pills are clickable, show active state and can toggle search off.
- `crm/v4/assets/v4/leads.js` includes `leadAnalyticsSearchText(lead)` in the lead search haystack.
- `crm/v4/index.html` loads `assets/v4/lead-analytics-badges-v1.js?v=20260709-1` after `leads.js`; the badges module loads the summary module.

The implementation does not change Supabase data and does not rewrite raw `leader_leads.service` or `leader_leads.source` values.

## Automated runtime coverage added on 2026-07-15

The following behavior is executed in CI by:

`node tools/test_crm_lead_analytics_runtime.mjs`

- normalization mappings for services and sources;
- actual `leadHaystack` inclusion of derived categories;
- summary aggregation and active pill rendering;
- summary search apply, toggle-off and clear actions;
- escaping of summary labels;
- badge service/source content;
- reuse of the hints container;
- badges are not duplicated on repeated decoration.

Detailed automated scope and boundaries:

`docs/CRM_LEAD_ANALYTICS_RUNTIME_HARNESS_2026-07-15.md`

## Automated published deployment coverage added on 2026-07-15

The separate checker:

`python3 tools/check_crm_lead_analytics_published.py`

verifies that GitHub Pages serves:

- the current CRM index;
- the current `leads.js` search integration;
- the badges module;
- the summary module;
- the normalization helper;
- the expected cache markers and import links.

Detailed deployment scope and retry behavior:

`docs/CRM_LEAD_ANALYTICS_PUBLISHED_SMOKE_2026-07-15.md`

The remaining manual check is therefore limited to authenticated real-data integration and visual/browser behavior. It does not need to re-prove static asset publication or isolated JavaScript behavior.

## Remaining manual test checklist

1. Open `https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`.
2. Log in as an allowed CRM user.
3. Wait until the real lead list is loaded.
4. Confirm that lead cards still show the original raw source and service in the metadata line.
5. Confirm that each lead card also shows derived badges:
   - `Услуга: ...`;
   - `Источник: ...`.
6. Confirm that the summary block `Сводка по заявкам` appears near the lead stats.
7. Confirm that the summary has two groups:
   - `Услуги`;
   - `Источники`.
8. Use the search field with one derived category, for example `Баннеры` or `Сайт`.
9. Confirm that the visible card count changes and matching real cards remain visible.
10. Click a category pill inside `Сводка по заявкам`.
11. Confirm that the search field is filled, the list is filtered, the selected pill is visually active and has `aria-pressed="true"`.
12. Click the same active category pill again and confirm that the full list returns.
13. Apply a category again, click `Сбросить поиск` and confirm that the active state disappears.
14. Click `Обновить заявки` and confirm that badges and the summary appear again without duplicates.
15. Switch away from the leads tab and back to `Заявки`.
16. Open a lead card and return to the list.
17. Confirm that no browser console errors appear from `leads.js`, `lead-analytics-badges-v1.js` or `lead-analytics-summary-v1.js` after authenticated data loading.
18. Repeat the visual check at a narrow mobile viewport and confirm that the summary and badges remain readable.

## Expected examples

The exact category depends on the raw lead values:

- raw service containing `баннер` should show `Услуга: Баннеры`;
- raw service containing `наклейк` should show `Услуга: Наклейки`;
- raw service containing `табличк` should show `Услуга: Таблички`;
- raw source/page URL related to the site should show `Источник: Сайт`;
- raw source `VK` or `ВКонтакте` should show `Источник: ВКонтакте`.

## Pass criteria

The test is passed if:

- authenticated real lead cards load normally;
- badges appear on real cards;
- the summary block appears and shows service/source groups;
- summary category clicks fill the search field and filter the live list;
- active summary category is visually highlighted;
- clicking the active category again clears the search;
- the `Сбросить поиск` button clears the search and active state;
- search works by derived categories on the real loaded list;
- badges are not duplicated after refresh/re-render;
- raw source/service values remain visible;
- no data changes are made in Supabase;
- no browser console errors appear from the leads, analytics badges or summary modules;
- desktop and mobile layouts remain readable.

## If the test fails

Keep #198 or #199 open and record:

- browser;
- account/role used for test;
- search query if search failed;
- category clicked if summary click/toggle failed;
- screenshot of the card or summary block;
- console error text if any;
- whether the authenticated list loaded before the badges, summary or search failed.
