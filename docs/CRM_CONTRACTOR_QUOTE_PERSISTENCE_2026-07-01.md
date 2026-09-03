# CRM contractor quote persistence — 2026-07-01

Scope: CRM РА «Лидер», implementation without schema migration.
Related issues: #143, #144.
Status updated: 2026-09-03.

## Implemented UI state

Подрядный расчёт больше не является отдельным параллельным калькулятором.

Он встроен в `crm/v4/assets/v4/calculations.js` как режим `contractor_quote` с пользовательским названием «Подрядчик / готовая смета».

Менеджер указывает:

- подрядчика;
- цену подрядчика;
- доставку;
- монтаж;
- дизайн;
- прочие расходы;
- при необходимости итог клиенту вручную;
- комментарий к позиции.

Наценка не дублируется внутри этого режима: используются общие настройки наценки единого конструктора. Если итог клиенту не введён вручную, `applyAutoPrice()` применяет текущую общую наценку и правила округления.

Клиентская часть остаётся одной строкой, а внутренние компоненты себестоимости сохраняются в JSON snapshot.

## Persistence

Используется тот же save-flow, что и для остальных режимов единого конструктора:

- `leader_lead_calculations` хранит итог расчёта;
- `leader_lead_calculation_items` хранит одну позицию подрядного расчёта;
- production использует существующую browser/RLS запись;
- exact staging использует существующий server action `calculation.create_initial`.

Отдельный endpoint, новая таблица и отдельная логика сохранения для подрядного режима не создаются.

## Supabase read-only finding

Повторная проверка production и staging 2026-09-03 подтвердила: существующие таблицы уже содержат все поля, нужные для сохранения подрядного расчёта.

Схема Supabase не изменяется.

## Calculation item

Одна позиция сохраняется с базовыми полями:

- `category = Подрядный расчёт`;
- `item_type = Изготовление`;
- `name` — клиентское название;
- `unit = комплект`;
- `qty = 1`;
- `contractor_price` — сумма внутренних затрат;
- `client_price` — рассчитанная или введённая вручную цена;
- остальные финансовые поля вычисляются общим `calcItem()`;
- `data` содержит immutable snapshot состава и режима.

## JSON snapshot

`data` содержит:

```json
{
  "builder_version": "calc-builder-v2",
  "mode": "contractor_quote",
  "calculation_mode": "contractor_quote",
  "visibility": "single_line",
  "client_visible": true,
  "vendor": "Vendor",
  "contractor": { "id": null, "name": "Vendor" },
  "contractor_quote": {
    "base": 0,
    "delivery": 0,
    "installation": 0,
    "design": 0,
    "other": 0,
    "total_cost": 0
  },
  "components": [],
  "pricing": { "manual_client_price": null },
  "price_source": "auto"
}
```

После автоматического ценообразования общий calculation builder также фиксирует `applied_markup_percent`.

## Failure and lead-state rules

Сохраняются существующие правила единого конструктора:

- production при ошибке вставки позиций откатывает созданный расчёт;
- staging выполняет атомарный server action;
- после успешного расчёта ранний статус заявки может перейти в `Расчёт подготовлен`;
- сохранённые расчёты продолжают использовать текущий механизм версий/ревизий.

## Legacy shell retirement

`calculation-contractor-quote-v1.js` больше не должен загружаться карточкой заявки и удаляется как устаревший UI shell. CI запрещает повторное подключение этого файла рядом с `calculations.js`.

## Security rule

- не использовать `service_role` или secret keys в браузере;
- не ослаблять RLS ради подрядного режима;
- не менять production schema или Edge Functions для этой задачи.
