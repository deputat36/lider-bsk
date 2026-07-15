# CRM lead analytics runtime harness — 2026-07-15

Scope: RA Lider CRM v4 lead analytics source contracts.

Related issues: #198, #199.

## Purpose

The runtime harness reduces the manual verification surface for the derived lead analytics layer without logging into CRM and without changing Supabase production.

Command:

```bash
node tools/test_crm_lead_analytics_runtime.mjs
```

## What is executed

The harness imports the real production helper:

`crm/v4/assets/v4/lead-analytics-normalization.js`

It also loads the real source of:

- `crm/v4/assets/v4/leads.js`;
- `crm/v4/assets/v4/lead-analytics-summary-v1.js`;
- `crm/v4/assets/v4/lead-analytics-badges-v1.js`.

The summary and badge modules are evaluated in an isolated Node VM with small local DOM/state stubs. Their boot functions are not executed, no network client is loaded and no browser storage is used.

## Covered behavior

The harness verifies:

1. Service normalization:
   - banner variants → `Баннеры`;
   - sticker/poster variants → `Наклейки`;
   - plate/sign variants → `Таблички`;
   - signboard → `Вывески`;
   - PVC → `ПВХ изделия`;
   - empty → `Не указано`;
   - unknown → `Другое`.
2. Source normalization:
   - site source or `lider-bsk.ru` page URL → `Сайт`;
   - VK variants → `ВКонтакте`;
   - manual, call, office and recommendation → `Ручной ввод`;
   - unknown → `Другое`;
   - empty → `Не указано`.
3. The actual `leadHaystack` function from `leads.js` contains derived service and source categories.
4. Summary aggregation sorts categories by count.
5. Summary pills:
   - contain the expected search value;
   - escape labels;
   - expose `aria-pressed=true` for the active category.
6. Clicking a summary category applies the search.
7. Clicking the same active category clears the search.
8. `Сбросить поиск` clears the search and re-renders the list.
9. Badge decoration:
   - adds derived service and source labels;
   - reuses the hints container;
   - does not duplicate badges on a repeated render.

## What remains manual

The harness does not replace the final published-browser check. The remaining manual verification is limited to integration facts that require the authenticated deployed CRM:

- the GitHub Pages bundle loads after authentication;
- the summary is inserted in the expected location;
- CSS is visually readable on desktop and mobile;
- live card refresh and tab navigation do not produce browser console errors;
- derived search filters the currently loaded production list as expected.

The detailed checklist remains in:

`docs/CRM_LEAD_ANALYTICS_BADGES_MANUAL_TEST_2026-07-09.md`

## Boundaries

- No Supabase SQL is executed.
- No Edge Function is called.
- No Auth session is created.
- No CRM data is loaded or modified.
- No production JavaScript file is changed by the harness.
- `nav_*` and `nav_v2_*` are outside this scope.
