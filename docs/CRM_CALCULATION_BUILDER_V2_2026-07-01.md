# CRM calculation builder v2 — 2026-07-01

Repository: `deputat36/lider-bsk`.
Scope: CRM РА «Лидер», tables with prefix `leader_*` only.
Tracking issue: #143.

This document describes the target calculation workflow for the advertising agency CRM.

## Why this is needed

The current CRM has several calculation modules and useful experiments, but the daily user experience should be one clear calculation builder.

Current frontend modules include:

- `crm/v4/assets/v4/calculations.js`;
- `crm/v4/assets/v4/calculations-standard.js`;
- `crm/v4/assets/v4/calculations-advanced.js`;
- `crm/v4/assets/v4/calculations-saved-tools-v2.js`.

The target state is not four separate calculators. The target state is one builder with several modes.

## Main principle

A calculation consists of client-facing positions.

Each client-facing position may have internal cost components.

By default, the commercial offer shows a client-facing position as one final line. The manager may enable detailed client breakdown when it is useful.

Internal costs, supplier prices, profit and margin must never be shown to the client by default.

## Calculation modes

### 1. Standard item

For common agency products that can be calculated automatically.

Examples:

- banner;
- self-adhesive film;
- PVC board sign;
- photo print;
- simple sticker;
- simple service.

The user enters dimensions, quantity and options. The CRM calculates area, perimeter, quantities and price.

### 2. Catalog item

For positions from `leader_catalog`.

The user searches or chooses a catalog item, changes quantity and optional parameters, then adds it to the calculation.

The user must be able to save a new catalog item directly from the calculation if the item does not exist yet.

### 3. Contractor quote

For cases where a supplier or contractor provides a price.

Example: a sign is quoted by a contractor.

The manager enters:

- client title;
- contractor;
- contractor quote amount;
- delivery/logistics;
- installation;
- design;
- hardware and consumables;
- other costs;
- markup percent or manual client price.

The CRM calculates:

- internal cost;
- client total;
- profit;
- margin;
- low-margin warning.

### 4. Manual position

For one-time work or a position that is not worth saving to the catalog yet.

The user enters:

- title;
- unit;
- quantity;
- internal unit cost;
- client unit price or markup;
- comment.

The user may save this position to catalog later.

### 5. Composite item

For products that are better sold as a finished item but consist of several internal components.

Example: `PVC sign with printed film`.

Internal components may include:

- PVC sheet;
- film;
- printing;
- lamination/application;
- cutting;
- design;
- delivery;
- installation;
- hardware;
- markup adjustment.

By default, the commercial offer shows one line, for example:

`PVC sign with full-color print — 7 500 ₽`.

If detailed mode is enabled, the commercial offer may show selected public components.

## Client visibility model

Each calculation item should support a visibility mode:

- `single_line` — show only the final client-facing title and amount;
- `detailed` — show public components in the commercial offer;
- `internal_only` — keep the component hidden from the client.

Default: `single_line`.

## Suggested item data model

The existing tables should remain the first target:

- `leader_lead_calculations`;
- `leader_lead_calculation_items`;
- `leader_catalog`;
- `leader_calculation_templates`;
- `leader_contractors`;
- `leader_expenses`.

Use existing columns for totals and stable fields. Store extended builder data in `data` JSON until a later schema migration is approved.

Suggested `data` shape for a client-facing item:

```json
{
  "builder_version": "calc-builder-v2",
  "mode": "contractor_quote",
  "visibility": "single_line",
  "client_title": "Facade sign",
  "internal_note": "Contractor quote plus installation",
  "contractor": {
    "id": null,
    "name": "Contractor name"
  },
  "components": [
    {
      "type": "contractor",
      "title": "Manufacturing by contractor",
      "qty": 1,
      "unit": "service",
      "internal_sum": 32000,
      "client_visible": false
    },
    {
      "type": "delivery",
      "title": "Delivery",
      "qty": 1,
      "unit": "service",
      "internal_sum": 2000,
      "client_visible": false
    },
    {
      "type": "installation",
      "title": "Installation",
      "qty": 1,
      "unit": "service",
      "internal_sum": 6000,
      "client_visible": true
    }
  ],
  "pricing": {
    "internal_total": 40000,
    "client_total": 59000,
    "profit": 19000,
    "margin_percent": 32.2,
    "markup_percent": 47.5
  }
}
```

## Commercial offer behavior

The commercial offer generator should read saved calculation items and build two text variants:

1. Short message for messenger.
2. Full commercial offer.

Rules:

- never show `contractor_price`, `contractor_sum`, profit or margin;
- show `client_sum` only;
- in `single_line`, show only the client title and final amount;
- in `detailed`, show only components marked as public/client-visible;
- internal-only components must not appear in client text.

## Workflow by role

### Manager

Works with lead, needs, calculation, commercial offer and order creation.

### Owner/admin

Can control margins, low-margin warnings, catalog, templates and contractors.

### Designer

Sees design tasks, not internal margin.

### Production

Sees production task, product details and deadline, not internal margin unless explicitly allowed.

### Installer

Sees installation task, address, contact, task details and result fields.

### Finance

Sees payments, expenses, plan/fact and profit.

## Implementation stages

### Stage 1 — Documentation and guardrails

- Add this document.
- Track work in issue #143.
- Add a local checker that protects key architecture markers.

### Stage 2 — Builder UI shell

- Add a single visible calculation builder entry point.
- Keep old modules available during transition, but avoid presenting several calculators as equal choices.
- Add mode selector: standard, catalog, contractor, manual, composite.

### Stage 3 — Contractor quote mode

- Implement a practical contractor quote form.
- Save extended data in `leader_lead_calculation_items.data`.
- Default commercial offer visibility: one line.

### Stage 4 — Catalog-backed mode

- Load active `leader_catalog` records.
- Add quick create from calculation.
- Keep hardcoded frontend catalog only as fallback during transition.

### Stage 5 — Commercial offer visibility

- Add item visibility handling to commercial offer generation.
- Support single-line and detailed modes.

### Stage 6 — Cleanup

- Remove duplicated calculation logic or hide old modules behind the new builder.
- Update manual test checklist.
- Add regression checks for the calculation workflow.

## Manual test scenarios

1. Banner with grommets and edge finishing.
2. PVC sign with film, print, application and cutting.
3. Contractor sign quote with delivery, installation and markup.
4. Manual design work as a separate position.
5. Composite item shown as one line in commercial offer.
6. Composite item shown with public breakdown in commercial offer.
7. Low-margin warning.
8. Order creation from approved commercial offer.
9. Finance plan/fact check after adding payment and expense.

## Production rule

Do not change Supabase production schema or deploy Edge Functions without explicit owner approval.
