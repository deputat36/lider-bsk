# CRM calculation builder v2 — 2026-07-01

Repository: `deputat36/lider-bsk`.
Scope: CRM РА «Лидер», only `leader_*` tables.
Tracking issue: #143.

## Goal

Replace scattered calculation modules with one clear calculation builder for daily agency work.

Current modules:

- `crm/v4/assets/v4/calculations.js`;
- `crm/v4/assets/v4/calculations-standard.js`;
- `crm/v4/assets/v4/calculations-advanced.js`;
- `crm/v4/assets/v4/calculations-saved-tools-v2.js`.

The target is one builder with several modes, not several equal calculators.

## Main principle

A calculation consists of client-facing positions.

Each client-facing position may have internal cost components.

By default, a commercial offer shows one final client-facing line. The manager may enable a detailed public breakdown when needed.

Internal costs, supplier prices, profit and margin must not be shown to the client by default.

## Modes

1. `standard` — automatic calculation for common products.
2. `catalog` — position from `leader_catalog`.
3. `contractor_quote` — supplier/contractor quote plus delivery, design, installation, other costs and markup.
4. `manual` — one-time manual position.
5. `composite` — finished product with internal components.

## Client visibility

Each item should support:

- `single_line` — show only final title and amount;
- `detailed` — show selected public components;
- `internal_only` — hide from the commercial offer.

Default visibility: `single_line`.

## Tables

First implementation should use the existing structure:

- `leader_lead_calculations`;
- `leader_lead_calculation_items`;
- `leader_catalog`;
- `leader_calculation_templates`;
- `leader_contractors`;
- `leader_expenses`.

Extended builder data should be stored in `data` JSON until a separate schema migration is approved.

## Commercial offer rules

The offer generator must:

- never show `contractor_price`, `contractor_sum`, profit or margin;
- show client totals only;
- show one line by default;
- show detailed public components only when enabled;
- keep internal components hidden.

## Implementation stages

1. Documentation and checks.
2. Builder UI shell.
3. Contractor quote mode.
4. Catalog-backed mode.
5. Commercial offer visibility handling.
6. Cleanup of duplicated calculation logic.

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
