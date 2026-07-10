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

## Manual test checklist

1. Open `https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`.
2. Log in as an allowed CRM user.
3. Wait until the lead list is loaded.
4. Confirm that lead cards still show the original raw source and service in the metadata line.
5. Confirm that each lead card also shows derived badges:
   - `Услуга: ...`;
   - `Источник: ...`.
6. Confirm that the summary block `Сводка по заявкам` appears near the lead stats.
7. Confirm that the summary has two groups:
   - `Услуги`;
   - `Источники`.
8. Use the search field with derived category examples:
   - `Баннеры`;
   - `Наклейки`;
   - `Сайт`;
   - `ВКонтакте`.
9. Confirm that the visible card count changes and matching cards remain visible.
10. Click a category pill inside `Сводка по заявкам`.
11. Confirm that the search field is filled with the clicked category and the list is filtered.
12. Confirm that the selected pill is visually active and has `aria-pressed="true"`.
13. Click the same active category pill again.
14. Confirm that the search field clears and the full list returns.
15. Apply a category again and click `Сбросить поиск`.
16. Confirm that the search field clears, the active state disappears and the full list returns.
17. Click `Обновить заявки`.
18. Confirm that the badges and summary appear again after the list refreshes.
19. Switch away from the leads tab and back to `Заявки`.
20. Confirm that the badges still appear and are not duplicated multiple times on the same card.
21. Open a lead card and return to the list.
22. Confirm that the lead list still works and no browser console errors appear from `leads.js`, `lead-analytics-badges-v1.js` or `lead-analytics-summary-v1.js`.

## Expected examples

The exact category depends on the raw lead values:

- raw service containing `баннер` should show `Услуга: Баннеры`;
- raw service containing `наклейк` should show `Услуга: Наклейки`;
- raw service containing `табличк` should show `Услуга: Таблички`;
- raw source/page URL related to the site should show `Источник: Сайт`;
- raw source `VK` or `ВКонтакте` should show `Источник: ВКонтакте`.

## Pass criteria

The test is passed if:

- lead cards load normally;
- badges appear on cards;
- the summary block appears and shows service/source groups;
- summary category clicks fill the search field and filter the list;
- active summary category is visually highlighted;
- clicking the active category again clears the search;
- the `Сбросить поиск` button clears the search and active state;
- search works by derived categories;
- badges are not duplicated after refresh/re-render;
- raw source/service values remain visible;
- no data changes are made in Supabase;
- no browser console errors appear from the leads, analytics badges or summary modules.

## If the test fails

Keep #198 or #199 open and record:

- browser;
- account/role used for test;
- search query if search failed;
- category clicked if summary click/toggle failed;
- screenshot of the card or summary block;
- console error text if any;
- whether the list loaded before the badges, summary or search failed.
