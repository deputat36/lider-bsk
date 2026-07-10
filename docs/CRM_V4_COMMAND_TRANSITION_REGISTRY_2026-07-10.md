# CRM v4 command and transition registry — 2026-07-10

Related: #200, #202, #204.

Mode: source-only contract. The registry is not yet enforced by production Edge Functions, RPCs, RLS or browser modules.

Canonical machine-readable source:

`contracts/crm-v4-command-transition-registry-v1.json`

Validator:

`tools/check_crm_v4_command_transition_registry.py`

## Purpose

The registry freezes one declarative contract for privileged and transaction-sensitive CRM v4 commands:

- command name;
- canonical permission key;
- entity and transition domain;
- transaction requirement;
- optimistic concurrency requirement;
- required payload fields;
- stable result envelope;
- mandatory audit target and event key;
- side effects that must succeed or fail together;
- allowed current-status to target-status transitions.

It is a migration contract, not a claim that server enforcement already exists.

## Read-only production status baseline

The following values were aggregated from `leader_*` tables without changing rows.

### Leads

- `Новая` — 3;
- `Уточнение деталей` — 1;
- `Расчёт подготовлен` — 2;
- `КП отправлено` — 1;
- `Создан заказ` — 5.

### Calculations

- `Черновик` — 2;
- `Расчёт подготовлен` — 1;
- `КП сформировано` — 1;
- `КП отправлено` — 1;
- `Создан заказ` — 5.

### Offers

- `Черновик` — 2;
- `Отправлено` — 1;
- `Согласовано` — 5.

### Orders

- `Новый` — 2;
- `Макет на согласовании` — 1;
- `В производстве` — 1;
- `Выдано` — 1.

### Production jobs

- `Не передано` — 1;
- `В производстве` — 1.

### Installation jobs

- `Запланирован` — 1.

This baseline is evidence for compatibility handling only. Counts will change during normal work and are not CI assertions.

## Compatibility states

The browser modules and historical data do not yet use one vocabulary everywhere.

The registry therefore preserves these live compatibility states until a separately approved migration is tested:

- calculation: `Расчёт подготовлен`;
- offer: `Отправлено` alongside canonical `КП отправлено`;
- order: `Макет на согласовании` and legacy `Отмена`;
- production job: `В производстве` alongside `Передано в производство` / `В работе`.

Unknown historical values must not be silently rewritten. A future server command should return a stable conflict or invalid-transition error and log privacy-safe diagnostics.

## Command inventory

| Command | Permission | Transaction | Transition domain | Audit target |
|---|---|---:|---|---|
| `calculation.save` | `calculations.write` | required | calculation | `leader_activity_log` |
| `offer.create_from_calculation` | `offers.write` | required | offer | `leader_commercial_offer_events` |
| `offer.transition` | `offers.transition` | required | offer | `leader_commercial_offer_events` |
| `order.create_from_offer` | `orders.create` | required | order | `leader_activity_log` |
| `order.create_manual` | `orders.create` | required | order | `leader_activity_log` |
| `order.transition` | `orders.transition` | required | order | `leader_activity_log` |
| `lead.transition` | `leads.transition` | required | lead | `leader_lead_events` |
| `production_job.update` | `production.write` | required | production job | `leader_production_events` |
| `installation_job.update` | `installation.write` | required | installation job | `leader_installation_events` |

All permission values must also exist in `crm/v4/assets/v4/action-permissions-v1.js`.

## Standard command envelope

Required:

```json
{
  "action": "domain.command",
  "request_id": "uuid",
  "payload": {}
}
```

Conditional for entity mutation:

```json
{
  "entity_id": "uuid",
  "expected_updated_at": "ISO timestamp"
}
```

`expected_updated_at` is required for mutable existing entities and provides optimistic concurrency. A stale value must produce `conflict`; the server must not overwrite newer work.

## Standard success envelope

```json
{
  "ok": true,
  "request_id": "uuid",
  "entity": {},
  "events": []
}
```

Stable error codes include:

- `access_denied`;
- `unknown_action`;
- `validation_error`;
- `forbidden`;
- `not_found`;
- `conflict`;
- `invalid_transition`;
- `duplicate_request`;
- `persistence_failed`.

Raw Postgres, service-role, JWT or stack details must not be returned to the browser.

## Transition rules

### Idempotent retry

Every domain allows current status equal to target status as an idempotent no-op. The same-status case is not repeated in each transition list.

### Terminal states

Terminal states have no outgoing transition in the registry:

- lead: `Создан заказ`;
- calculation: `Создан заказ`;
- offer: `Согласовано`;
- order: `Закрыт`, `Отменён`, legacy `Отмена`;
- production job: `Готово`;
- installation job: `Выполнен`.

Reopening a terminal entity requires a new versioned command and explicit permission; it must not be achieved by generic update.

### Reason-required targets

A reason is mandatory for loss/problem/cancellation targets such as:

- lead rejection, no answer, expensive, changed mind or spam;
- rejected offer/calculation;
- cancelled order;
- production or installation problem.

## Transaction boundaries

Examples of operations that must be atomic:

- calculation header, item replacement, server totals, lead synchronization and audit;
- offer, calculation link/status, lead status and offer event;
- order, items, client/lead/offer/calculation links and audit;
- production job, order production stage and event;
- installation job, order installation stage and event.

A best-effort audit insert after a successful business write is not acceptable for these commands.

## Audit targets verified read-only

Existing `leader_*` event/audit tables include:

- `leader_lead_events`;
- `leader_commercial_offer_events`;
- `leader_production_events`;
- `leader_installation_events`;
- `leader_activity_log`.

`leader_activity_log` currently provides `user_id`, `action`, `entity`, `entity_id`, JSON `data` and `created_at`; command implementations must store privacy-safe metadata only.

## Enforcement sequence

1. Keep this registry and checker green in GitHub.
2. Generate or copy a server-owned registry into a Supabase development branch.
3. Verify all seven canonical roles and fail closed for unknown roles.
4. Implement one command domain at a time, beginning with offers/calculations.
5. Run positive, negative, duplicate-request and stale-version tests.
6. Compare browser result fields against role-specific projections.
7. Keep existing live paths until browser proof and rollback are complete.
8. Obtain explicit approval before production deploy, DDL, RLS or grant changes.

## Guardrails

- no production DDL or DML in this step;
- no Edge Function deployment;
- no RLS, grant, Auth or data changes;
- no automatic rewrite of compatibility statuses;
- no `nav_*`, Parket or Broker changes;
- UI permission checks remain defense-in-depth and are not server authorization.

## Acceptance criteria for this source-only stage

- all target transaction-backed commands are declared;
- every command maps to an existing canonical permission;
- every command declares transaction, concurrency, audit and side-effect contracts;
- all transition targets refer to declared states;
- terminal states have no outgoing transitions;
- live compatibility states are represented;
- source UI status markers remain covered;
- CI fails if the registry, permission keys or transition graph drift.
