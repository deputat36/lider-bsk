# CRM lead analytics normalization plan — 2026-07-07

Scope: RA Lider CRM analytics.

Related issues: #196, #197, #198, #199.
Current source audit: `docs/PUBLIC_LEAD_FUNNEL_AGGREGATES_READONLY_2026-07-15.md`.
Previous source audit: `docs/PUBLIC_LEAD_FUNNEL_AGGREGATES_READONLY_2026-07-05.md`.
Current normalized dry run: `docs/CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-15.md`.
Previous normalized dry run: `docs/CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-10.md`.

This is a planning and implementation-status document. Do not rewrite existing `leader_leads.service` or `leader_leads.source` values without explicit data-change approval.

## Problem

Read-only aggregates show that the CRM lead funnel works, but analytics fields are heterogeneous:

- services are stored as raw free-form values;
- sources are stored as raw free-form values;
- historical rows should remain auditable.

## Current public lead contract

`supabase/functions/leader-public-lead/index.ts` currently stores the submitted raw values in `leader_leads`:

- `service` comes from the public form body;
- `source` comes from the public form body or falls back to `Сайт`;
- `request_id`, `source_page_path`, `submitted_at`, `page_url`, UTM fields and audit payload are preserved separately.

This is the right boundary for the public write path. The public Edge Function should keep saving the original user/form values. Analytics normalization should be derived later in CRM/reporting code or in a separately approved database view.

## 2026-07-09 UI implementation status

Implemented in GitHub source:

- `crm/v4/assets/v4/lead-analytics-normalization.js` derives service and source categories from raw lead values.
- `crm/v4/assets/v4/lead-analytics-badges-v1.js` decorates already-rendered CRM lead cards with derived badges.
- `crm/v4/assets/v4/lead-analytics-summary-v1.js` adds a small aggregate summary block for derived services and sources.
- `crm/v4/assets/v4/leads.js` includes `leadAnalyticsSearchText(lead)` in `leadHaystack(lead)`, so browser-side search can find derived categories.
- `crm/v4/index.html` loads the badges module after `leads.js` using `assets/v4/lead-analytics-badges-v1.js?v=20260709-1`; the badges module loads the summary module.
- `tools/check_crm_lead_analytics_normalization.py` validates the helper, badges module, summary module, index hook and guardrails.
- `.github/workflows/crm-lead-analytics-check.yml` runs the checker and JavaScript syntax checks.

Still in progress:

- Manual browser verification remains required before closing #198 and #199.
- `patches/crm-lead-derived-search.patch` remains as documentation of the minimal safe patch for `crm/v4/assets/v4/leads.js`.

## Current read-only normalized dry run

The current full-table control snapshot is captured in `docs/CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-15.md`.

It records 13 leads and explains the only change from the 2026-07-10 snapshot: one manual CRM lead increased `Баннеры` from 3 to 4 and `Ручной ввод` from 4 to 5.

The snapshot gives database-side control totals for normalized categories without changing raw values.

Important comparison boundary:

- the CRM browser summary works from the loaded lead list;
- the dry run works from the full `public.leader_leads` table;
- if the database grows beyond the current CRM list limit, UI counts and full database dry-run counts may differ by design.

## Principle

Keep raw values as the audit trail and add normalized categories as a derived analytics layer.

Do not change Supabase production until a separate approved implementation task exists.

## Draft service categories

Suggested normalized service categories:

- `Баннеры` — raw examples: `Баннер`, `Срочный баннер`, `Праздничный баннер`.
- `Наклейки` — raw examples: `Наклейка на авто`, `наклейки на авто`, `Афиши и наклейки`.
- `Таблички` — raw examples: `Табличка`, `Таблички и монтаж`, `Печать / таблички`.
- `Вывески` — raw examples: `Вывеска`.
- `ПВХ изделия` — raw examples: `изделия из пвх`.
- `Не указано` — raw examples: empty service values.
- `Другое` — fallback for values that do not match the map.

## Draft source categories

Suggested normalized source categories:

- `Сайт` — raw examples: `Сайт`, `Форма сайта`, `www.lider-bsk.ru`.
- `ВКонтакте` — raw examples: `VK`, `ВКонтакте`.
- `Одноклассники` — raw examples: `Одноклассники`.
- `MAX` — raw examples: `MAX`.
- `Ручной ввод` — raw examples: `Вручную`, `Звонок`, `Офис`, `Рекомендация`.
- `Другое` — fallback for values that do not match the map.

## Safe implementation options

Preferred order:

1. Add documentation and checker coverage first.
2. Add a frontend/reporting helper that derives normalized categories at display time.
3. Add a database view only after explicit approval.
4. Add persisted normalized columns only if reporting needs require it and after explicit approval.

## Reporting notes

A future report should show both values:

- raw value: what the manager or form originally saved;
- normalized category: what analytics uses for grouping.

## Non-goals

- No destructive updates to existing `leader_leads` rows.
- No automatic backfill without approval.
- No Supabase DDL/DML in autonomous mode.
- No changes to `nav_*` or unrelated projects.