# CRM contractor quote persistence — 2026-07-01

Scope: CRM РА «Лидер», first implementation without schema migration.
Related issues: #143, #144.

## Current UI state

`crm/v4/assets/v4/calculation-contractor-quote-v1.js` provides the first visible contractor quote shell.

It calculates:

- contractor/base cost;
- delivery;
- installation;
- design;
- other costs;
- markup;
- manual client total;
- profit;
- margin.

## Supabase read-only finding

The existing tables already contain the fields needed for first persistence:

- `leader_lead_calculations`;
- `leader_lead_calculation_items`.

No first-stage migration is required.

RLS policies for calculation tables allow authenticated CRM users through `leader_private.leader_has_access()`.

## First persistence target

Create one row in `leader_lead_calculations`:

- `lead_id`;
- `need_id` optional;
- `client_id` optional;
- `title`;
- `status = Черновик`;
- `version_number`;
- `client_total`;
- `contractor_cost`;
- `profit`;
- `margin_percent`;
- `warning_level`;
- `warnings`;
- `public_comment`;
- `internal_comment`.

Create one row in `leader_lead_calculation_items`:

- `calculation_id`;
- `lead_id`;
- `category = Подрядный расчёт`;
- `item_type = Готовое изделие`;
- `name`;
- `unit = комплект`;
- `qty = 1`;
- `contractor_price`;
- `contractor_sum`;
- `markup_percent`;
- `client_price`;
- `client_sum`;
- `profit`;
- `margin_percent`;
- `comment`;
- `data`;
- `sort_order = 1`.

## Required JSON data

The `data` field should include:

```json
{
  "builder_version": "calc-builder-v2",
  "mode": "contractor_quote",
  "visibility": "single_line",
  "client_title": "Client-facing title",
  "contractor": { "id": null, "name": "Vendor" },
  "components": [],
  "pricing": {}
}
```

## Rollback rule

If calculation insert succeeds but item insert fails, delete the created calculation row.

## Lead state

After successful save:

- reload calculations with `loadCalculations(leadId)`;
- keep lead status unchanged or move it to `Расчёт подготовлен` only if the current status is still early-stage.

## Security rule

Do not expose service role keys in browser assets.

Do not deploy Edge Functions or change production schema without explicit owner approval.
