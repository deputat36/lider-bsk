# Public lead funnel aggregates read-only check — 2026-07-15

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: RA Lider public site → CRM lead handoff.

This document records read-only aggregate checks only. No personal lead data is included. No Supabase DDL, DML, Edge Function deploy, RLS, grants, policies or data changes were performed.

## Snapshot metadata

- Total leads checked: `13`.
- First lead created at: `2026-06-07 09:44:56.778722+00`.
- Latest lead created at: `2026-07-15 09:55:01.673176+00`.
- Active public intake: `leader-public-lead` v10, `verify_jwt=false`.
- The latest row was created manually in CRM and is not a new public-form proof.

## Status aggregate

| Status | Leads |
|---|---:|
| Создан заказ | 5 |
| Новая | 3 |
| Расчёт подготовлен | 3 |
| КП отправлено | 1 |
| Уточнение деталей | 1 |

Control total: `13`.

The only status-count change from the 2026-07-05 snapshot is `Расчёт подготовлен`: `2 → 3`.

## Raw service aggregate

| Raw service value | Leads |
|---|---:|
| Баннер | 2 |
| (empty) | 1 |
| Афиши и наклейки | 1 |
| Вывеска | 1 |
| изделия из пвх | 1 |
| Наклейка на авто | 1 |
| наклейки на авто | 1 |
| Печать / таблички | 1 |
| Праздничный баннер | 1 |
| Срочный баннер | 1 |
| Табличка | 1 |
| Таблички и монтаж | 1 |

Control total: `13`.

Raw service values remain intentionally heterogeneous and auditable. The current derived normalization is documented separately in `CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-15.md`.

## Raw source aggregate

| Raw source value | Leads |
|---|---:|
| Вручную | 2 |
| Сайт | 2 |
| MAX | 1 |
| VK | 1 |
| www.lider-bsk.ru | 1 |
| ВКонтакте | 1 |
| Звонок | 1 |
| Одноклассники | 1 |
| Офис | 1 |
| Рекомендация | 1 |
| Форма сайта | 1 |

Control total: `13`.

Raw source values remain intentionally unchanged. Normalized reporting categories are derived without rewriting these values.

## Attribution coverage

| Field | Leads with value | Coverage |
|---|---:|---:|
| `request_id` | 1 | 7.7% |
| `source_page_path` | 1 | 7.7% |
| `submitted_at` | 1 | 7.7% |
| `utm_source` | 6 | 46.2% |
| `page_url` | 9 | 69.2% |

The low coverage of `request_id`, `source_page_path` and `submitted_at` is historical. The only existing trace-complete row was created on 2026-06-28. A controlled production browser E2E is still approval-gated in issue #206.

## Funnel interpretation

- `5` of `13` leads have status `Создан заказ` — an observed status share of `38.5%`.
- The sample is too small and operationally mixed to treat this as a stable conversion rate.
- Manual, office, phone, social and public-site leads coexist in the same small dataset.
- The newest row increases `Баннер` and `Вручную` counts but does not provide new evidence for the public form.
- Source and service normalization tasks #196 and #197 are completed as a derived analytics layer; raw fields remain unchanged.

## Current safe next work

1. Keep raw source and service values for audit and use derived categories for reporting.
2. Keep public form cache, request trace and attribution contracts green.
3. Perform one controlled production browser E2E only after explicit owner approval under #206.
4. Add real portfolio evidence only after approved materials are supplied under #235.
5. Add LocalBusiness/NAP details only after verified contact data is supplied under #236.
6. Do not backfill or rewrite existing lead rows without explicit data-change approval.

## Boundaries

- No personal lead fields are included in this document.
- No DDL was executed.
- No DML was executed.
- No Edge Function was deployed.
- No Auth, RLS, grants or policies were changed.
- No CRM UI code was changed.
- No `nav_*` or `nav_v2_*` code was changed.

## Related work

- #142 — public site growth audit.
- #196 — normalized service categories, completed.
- #197 — normalized source categories, completed.
- #206 — controlled production browser E2E, approval-gated.
- `docs/CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-15.md` — current normalized category snapshot.
- `docs/PUBLIC_REQUEST_BROWSER_E2E_RUNBOOK_2026-07-12.md` — controlled browser E2E instructions and current baseline.