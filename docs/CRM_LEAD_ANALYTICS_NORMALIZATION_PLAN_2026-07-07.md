# CRM lead analytics normalization plan — 2026-07-07

Scope: RA Lider CRM analytics.

Related issues: #196, #197.
Source audit: `docs/PUBLIC_LEAD_FUNNEL_AGGREGATES_READONLY_2026-07-05.md`.

This is a planning document only. Do not rewrite existing `leader_leads.service` or `leader_leads.source` values without explicit data-change approval.

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
