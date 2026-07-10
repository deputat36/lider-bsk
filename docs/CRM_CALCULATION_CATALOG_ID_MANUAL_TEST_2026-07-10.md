# Проверка сохранения catalog_id в расчёте CRM

Дата: 2026-07-10.

Связано: #156, #167, #168, #169.

Контур:

`CRM v4 → calculations.js → leader_lead_calculation_items.catalog_id`.

## Read-only baseline

Проверка production Supabase до тестовой записи:

- столбец `public.leader_lead_calculation_items.catalog_id` существует;
- всего позиций расчётов: 28;
- позиций с заполненным `catalog_id`: 0;
- исторические строки не изменялись.

## Что исправлено в source

`calcItem(raw, index)` теперь возвращает:

`catalog_id: raw.catalog_id || null`.

Это сохраняет связь новой позиции с каталогом при формировании payload для `leader_lead_calculation_items` и оставляет `null` для ручной позиции.

## Автоматическая проверка

Запустить:

```bash
node --check crm/v4/assets/v4/calculations.js
python3 tools/check_calculations_catalog_id.py
node tools/test_calculations_catalog_id.mjs
```

Тест проверяет:

- UUID catalog-backed позиции сохраняется без изменения;
- ручная позиция без каталога получает `null`;
- расчёт сумм, прибыли и sort order не изменился.

## Ручной browser/database proof

Проводить на тестовой заявке или Supabase development branch. Production-тест допустим только с заранее созданной служебной заявкой и последующей документированной очисткой.

1. Открыть CRM v4 и тестовую заявку.
2. Создать расчёт.
3. Добавить позицию из каталога, у которой известен `leader_catalog_items.id`.
4. Сохранить расчёт.
5. Записать ID созданного расчёта.
6. Read-only SQL-запросом проверить позиции:

```sql
select id, calculation_id, catalog_id, name, qty, client_sum
from public.leader_lead_calculation_items
where calculation_id = '<TEST_CALCULATION_ID>'
order by sort_order;
```

7. Убедиться, что у catalog-backed позиции `catalog_id` совпадает с ID выбранного элемента каталога.
8. Добавить ручную позицию и повторно сохранить расчёт.
9. Убедиться, что у ручной позиции `catalog_id is null`.
10. Проверить открытие расчёта после перезагрузки CRM.

## Что считать ошибкой

- catalog-backed строка сохраняется с `catalog_id = null`;
- ID отличается от выбранного элемента каталога;
- ручная позиция получает чужой catalog ID;
- после перезагрузки связь теряется;
- totals, profit или sort order изменились из-за patch.

## Ограничения текущего этапа

- production DML не выполнялся;
- тестовая заявка и расчёт не создавались;
- Supabase schema, RLS, grants, Edge Functions и данные не менялись;
- `nav_*` не затрагивались.

Source-level исправление считается выполненным после зелёных CI-проверок. Issue #169 остаётся открытой до browser/database proof новой catalog-backed позиции.
