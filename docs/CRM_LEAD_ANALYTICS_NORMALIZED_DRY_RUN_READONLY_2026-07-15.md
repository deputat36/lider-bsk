# CRM lead analytics normalized dry run — 2026-07-15

Scope: RA Lider public-site → CRM lead analytics handoff.

Related issues: #142, #196, #197, #198, #199.

Source table: `public.leader_leads`.

Mode: read-only SQL dry run. No Supabase production changes were made.

## Snapshot metadata

- Total leads: 13.
- First lead created at: `2026-06-07 09:44:56.778722+00`.
- Last lead created at: `2026-07-15 09:55:01.673176+00`.
- Snapshot checked on: `2026-07-15`.
- The latest row has source `Вручную`, service `Баннер` and was created through `CRM v4 / ручное создание`.

## Purpose

This document captures a database-side read-only dry run of the same derived normalization rules used by `crm/v4/assets/v4/lead-analytics-normalization.js`.

Raw `service`, `source` and `page_url` values remain the audit trail. The normalized categories are reporting labels only and must not overwrite source data.

## Service category dry run

| Normalized service category | Leads | Created order status |
|---|---:|---:|
| Баннеры | 4 | 1 |
| Наклейки | 3 | 0 |
| Таблички | 3 | 3 |
| Вывески | 1 | 0 |
| Не указано | 1 | 0 |
| ПВХ изделия | 1 | 1 |

Control total: 13 leads.

## Source category dry run

| Normalized source category | Leads | Created order status |
|---|---:|---:|
| Ручной ввод | 5 | 2 |
| Сайт | 4 | 1 |
| ВКонтакте | 2 | 2 |
| MAX | 1 | 0 |
| Одноклассники | 1 | 0 |

Control total: 13 leads.

## Change from the 2026-07-10 snapshot

One manual CRM lead was added on `2026-07-15 09:55:01.673176+00` with raw source `Вручную` and raw service `Баннер`.

Therefore:

- total leads changed from 12 to 13;
- `Баннеры` changed from 3 to 4;
- `Ручной ввод` changed from 4 to 5;
- all other normalized counts stayed unchanged.

This row is not a public-form submission and does not change the browser E2E status of issue #206.

## Mapping contract

The dry run mirrors the current frontend helper:

- service tokens: `баннер`, `наклейк`, `афиш`, `табличк`, `вывеск`, `пвх`;
- source tokens: `сайт`, `site`, `lider-bsk.ru`, `форма сайта`, `vk`, `вконтакте`, `одноклассники`, `max`, `вручную`, `звонок`, `офис`, `рекомендация`;
- empty service becomes `Не указано`;
- unmatched values become `Другое`;
- source matching uses the combined raw `source` and `page_url` text.

## Manual comparison checklist

Open CRM:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

After login and lead load:

1. Check the `Сводка по заявкам` block.
2. Compare visible category counts with this read-only dry run.
3. Click a category pill, for example `Баннеры` or `Сайт`.
4. Confirm the search field is filled and the list is filtered.
5. Click the active category again or use `Сбросить поиск`.
6. Confirm the full list returns.

## Boundaries

- Raw `leader_leads.service` values were not changed.
- Raw `leader_leads.source` values were not changed.
- Raw `leader_leads.page_url` values were not changed.
- No DDL was executed.
- No DML was executed.
- No Edge Function deploy was executed.
- No Auth, RLS, grants or policies were changed.
- No CRM UI code was changed in this snapshot refresh.
- No `nav_*` or `nav_v2_*` code was changed.

## Reporting boundary

The CRM browser summary works from the leads loaded into the browser. This read-only dry run works from the full `public.leader_leads` table. If the database grows beyond the CRM list limit, browser counts and full-table aggregates may differ by design.