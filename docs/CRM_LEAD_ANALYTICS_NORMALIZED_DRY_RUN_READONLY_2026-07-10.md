# CRM lead analytics normalized dry run — 2026-07-10

Scope: RA Lider CRM analytics.

Related issues: #196, #197, #198, #199.

Source table: `public.leader_leads`.

Mode: read-only SQL dry run. No Supabase production changes were made.

## Purpose

This document captures a read-only database-side dry run of the same normalization logic that is now used in the CRM browser UI.

The goal is to compare the browser UI summary with database aggregates without rewriting raw values.

## Service category dry run

| Normalized service category | Leads | Created order status |
|---|---:|---:|
| Баннеры | 3 | 1 |
| Наклейки | 3 | 0 |
| Таблички | 3 | 3 |
| Вывески | 1 | 0 |
| Не указано | 1 | 0 |
| ПВХ изделия | 1 | 1 |

## Source category dry run

| Normalized source category | Leads | Created order status |
|---|---:|---:|
| Ручной ввод | 4 | 2 |
| Сайт | 4 | 1 |
| ВКонтакте | 2 | 2 |
| MAX | 1 | 0 |
| Одноклассники | 1 | 0 |

## Manual comparison checklist

Open CRM:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

After login and lead load:

1. Check the `Сводка по заявкам` block.
2. Compare visible category counts with this read-only dry run.
3. Click a category pill, for example `Баннеры` or `Сайт`.
4. Confirm the search field is filled and the list is filtered.
5. Clear search and confirm the full list returns.

## Boundaries

- Raw `leader_leads.service` values were not changed.
- Raw `leader_leads.source` values were not changed.
- No DDL was executed.
- No DML was executed.
- No Edge Function deploy was executed.
- No Auth, RLS, grants or policies were changed.

## Notes

The CRM browser summary currently works from the loaded lead list. If the UI list is limited to the latest 50 leads and the database has more than 50 rows in the future, UI counts may differ from full database read-only aggregates.
