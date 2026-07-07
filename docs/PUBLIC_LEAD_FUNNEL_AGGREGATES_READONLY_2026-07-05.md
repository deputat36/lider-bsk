# Public lead funnel aggregates read-only check — 2026-07-05

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.
Scope: RA Lider public site → CRM lead handoff.

This document records read-only aggregate checks only. No personal lead data is included. No Supabase DDL, DML, Edge Function deploy, RLS, grants, policies or data changes were performed.

## Status aggregate

Total leads checked: `12`.

Status distribution:

- `Создан заказ`: `5`;
- `Новая`: `3`;
- `Расчёт подготовлен`: `2`;
- `КП отправлено`: `1`;
- `Уточнение деталей`: `1`.

## Service aggregate

The service field is filled, but values are still heterogeneous. Each of the following values appeared once:

- `(empty)`;
- `Афиши и наклейки`;
- `Баннер`;
- `Вывеска`;
- `изделия из пвх`;
- `Наклейка на авто`;
- `наклейки на авто`;
- `Печать / таблички`;
- `Праздничный баннер`;
- `Срочный баннер`;
- `Табличка`;
- `Таблички и монтаж`.

Converted-to-order counts were present for several service values, but the sample is too small for reliable conversion conclusions.

## Source aggregate

The source field is also heterogeneous. Examples from the aggregate check:

- `Сайт`: `2`;
- `Форма сайта`: `1`;
- `www.lider-bsk.ru`: `1`;
- `VK`: `1`;
- `ВКонтакте`: `1`;
- `MAX`: `1`;
- `Одноклассники`: `1`;
- `Вручную`: `1`;
- `Звонок`: `1`;
- `Офис`: `1`;
- `Рекомендация`: `1`.

## Interpretation

The CRM lead funnel is working: `5` of `12` leads are already in the `Создан заказ` status.

The main analytics issue is classification quality rather than table structure:

- service names are not normalized;
- source names are not normalized;
- only a small portion of historical leads has new attribution fields such as `request_id`, `source_page_path` and `submitted_at`.

## Recommended next work

1. Keep public service values aligned with the shared public form helper and the service-prefill checkers.
2. Add a future CRM/reporting task to normalize service categories for analytics without overwriting raw historical text.
3. Add a future CRM/reporting task to normalize source categories, while keeping the original `source` value for audit.
4. After the next real public form submission, verify that the new attribution fields are populated.
5. Do not backfill or rewrite existing lead rows without explicit data-change approval.

## Related work

- #142 — public site growth audit.
- #185 — public lead form cache bust.
- #191 — large public landing page CSS extraction.
- #195 — first page migration for `pechat-bannerov-borisoglebsk.html`.
