# CRM: staging-проверка дублей потребностей

Дата: 21 июля 2026 года.

## Контур

- Staging project: `lider-bsk-staging`.
- Production Supabase использовался только для read-only аудита.
- Production DDL/DML, RLS, grants, Auth, Storage, Edge Functions и реальные записи не изменялись.

## Совместимость схемы

В staging таблица `leader_lead_calculations` отставала от production и не содержала поля `is_current_revision`.

Применена только staging-миграция:

`staging_need_duplicate_dependency_compat`

Она добавила совместимое поле:

```sql
alter table public.leader_lead_calculations
  add column if not exists is_current_revision boolean not null default true;
```

Файл сохранён только в `supabase/staging/20260721102500_staging_need_duplicate_dependency_compat.sql`. Под `supabase/migrations` такой миграции быть не должно.

## Синтетический сценарий

Созданы:

- одна синтетическая заявка;
- три полностью одинаковые активные потребности;
- один расчёт, связанный с самой поздней из трёх потребностей.

Время создания потребностей отличалось примерно на девять секунд.

## Результат dependency preflight

Read-only запрос по `leader_lead_calculations.need_id` показал:

1. Самая поздняя потребность — `calculation_count = 1`, `current_calculation_count = 1`.
2. Первая потребность — `calculation_count = 0`.
3. Вторая потребность — `calculation_count = 0`.

Ожидаемое поведение модели подтверждено:

- запись с расчётом должна быть выбрана основной, несмотря на более позднюю дату создания;
- архивирование связанной записи должно быть заблокировано;
- две независимые записи без расчётов являются кандидатами на одиночное подтверждаемое архивирование;
- автоматическое массовое архивирование не выполняется.

## Очистка

После проверки удалены:

- синтетический расчёт;
- три синтетические потребности;
- синтетическая заявка.

Контрольный результат:

- `lead_rows = 0`;
- `need_rows = 0`;
- `calculation_rows = 0`.

## Advisors

После staging DDL запущены security и performance advisors.

Новых критических предупреждений не появилось. Остались информационные уведомления закрытого service-role стенда:

- RLS enabled without policies на ряде staging-таблиц, доступных только служебному контуру;
- ранее существующие unused indexes.

Поле `is_current_revision` не создало нового публичного доступа и не потребовало изменения production.

## Итог

Staging подтвердил, что безопасный разбор дублей должен учитывать реальные зависимости, а не только возраст записи. Тестовые строки очищены, production-данные не изменены.