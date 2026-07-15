# Staging-индексы внешних ключей версий расчёта

Дата: 15 июля 2026 года.

Статус: staging-only advisor remediation. Production не изменяется.

## Результат advisors

После применения canonical calculation-version install и grant hardening security advisors не показали WARN или ERROR.

Performance advisors выявили два INFO `unindexed_foreign_keys`:

- `public.leader_lead_calculations.need_id`;
- `public.leader_lead_calculation_items.lead_id`.

Оба внешних ключа участвуют в проверках связности и потенциальных cascade/set-null операциях, поэтому advisor замечания исправляются до Edge deployment.

## Production-сравнение

Read-only проверка production `ofewxuqfjhamgerwzull` подтвердила существование аналогичных индексов:

- `leader_lead_calculations_need_id_idx`;
- `leader_lead_calculation_items_lead_id_idx`.

Production использовался только для чтения `pg_indexes`.

## Staging migration

Файл:

`supabase/staging-migrations/20260715_06_calculation_version_fk_indexes.sql`.

Migration:

1. Проверяет точный `leader_staging.environment_guard`.
2. Проверяет наличие обеих таблиц расчётов.
3. Создаёт индекс `leader_lead_calculations_need_id_idx`.
4. Создаёт индекс `leader_lead_calculation_items_lead_id_idx`.
5. Завершается ошибкой, если любой индекс отсутствует после DDL.

## Порядок

Migration 06 применяется после:

1. `20260715_04_calculation_version_install.sql`;
2. `20260715_05_calculation_version_grant_hardening.sql`;
3. основного acceptance;
4. safe-response acceptance.

После migration 06 повторно запускаются performance advisors. Edge Function разворачивается только при отсутствии новых actionable WARN/ERROR и устранении двух `unindexed_foreign_keys`.

## Границы

Не изменяются:

- production schema и данные;
- Auth;
- RLS policies;
- grants;
- функции;
- Edge Functions;
- `nav_*`, `parket_*`, `broker_*`.