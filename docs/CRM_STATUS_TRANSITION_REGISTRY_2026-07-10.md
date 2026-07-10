# CRM v4 status transition registry — 2026-07-10

Related: #200, #202, #204, #214, #217.

Mode: source contract and read-only Supabase audit only. No production DDL, DML, RLS, grants, Auth, Storage or Edge Function change was made.

## Problem

CRM uses several independent status fields:

- lead sales funnel;
- commercial offer lifecycle;
- order lifecycle;
- payment state;
- layout approval;
- production;
- installation;
- design tasks;
- individual payment records;
- future order documents.

The same Russian label may mean different things in different domains. A single global list would be unsafe.

## Source contract

File:

`crm/v4/assets/v4/status-transitions-v1.js`

Registry version:

`CRM_STATUS_REGISTRY_VERSION = 1`

Each domain contains:

- canonical domain key;
- Russian label;
- default action permission;
- versioned status definitions.

Each status contains:

- canonical key;
- Russian label;
- legacy aliases;
- terminal flag;
- allowed target keys;
- permission key;
- timestamp field;
- audit event.

The registry does not write to Supabase.

## Read-only production snapshot

Snapshot date: 2026-07-10.

### Leads

| Raw status | Rows |
|---|---:|
| Новая | 3 |
| Уточнение деталей | 1 |
| Расчёт подготовлен | 2 |
| КП отправлено | 1 |
| Создан заказ | 5 |

### Commercial offers

| Raw status | Rows |
|---|---:|
| Черновик | 2 |
| Отправлено | 1 |
| Согласовано | 5 |

### Orders

| Raw status | Rows |
|---|---:|
| Новый | 2 |
| Макет на согласовании | 1 |
| В производстве | 1 |
| Выдано | 1 |

### Order payment state

| Raw status | Rows |
|---|---:|
| Не оплачено | 2 |
| Предоплата | 1 |
| Частично оплачено | 1 |
| Оплачено | 1 |

### Layout state

| Raw status | Rows |
|---|---:|
| Макета нет | 2 |
| На согласовании | 1 |
| Макет согласован | 2 |

### Production state

| Raw status | Rows |
|---|---:|
| Не передано | 3 |
| В производстве | 1 |
| Выдано | 1 |

### Installation state

| Raw status | Rows |
|---|---:|
| NULL | 2 |
| Не назначен | 1 |
| Запланирован | 1 |
| Не требуется | 1 |

### Payment records

| Raw status | Rows |
|---|---:|
| Проведён | 3 |

The snapshot is evidence only. It must not be treated as a complete list of every future allowed state.

## Domains and permissions

| Domain | Source field | Transition permission |
|---|---|---|
| `lead` | `leader_leads.status` | `leads.transition` |
| `offer` | `leader_commercial_offers.status` | `offers.transition` |
| `order` | `leader_orders.status` | `orders.transition` |
| `layout` | layout status fields | `design.write` |
| `production` | production status fields | `production.write` |
| `installation` | installation status fields | `installation.write` |
| `payment` | `leader_orders.payment_status` | `finance.write` |
| `payment_record` | `leader_payments.payment_status` | `finance.write` |
| `design_task` | `leader_design_tasks.task_status` | `design.write` |
| `document` | future order document status | target-specific `documents.*` action |

## Helper contract

Exports include:

- `canonicalStatusKey(domain, rawValue)`;
- `statusDefinition(domain, value)`;
- `statusLabel(domain, value)`;
- `allowedStatusTransitions(domain, fromValue)`;
- `canTransitionStatus(domain, fromValue, toValue)`;
- `transitionPermission(domain, toValue)`;
- `validateStatusTransition(domain, fromValue, toValue)`;
- `statusRegistrySummary()`.

Normalization:

- trims values;
- compares case-insensitively;
- treats `ё` and `е` as equivalent;
- supports explicitly listed legacy aliases;
- does not mutate stored rows.

## Terminal states

Terminal states have `terminal = true` and an empty `allowedTo` list unless a future controlled reopening flow is explicitly designed.

Examples:

- lead `Создан заказ`;
- offer `Согласовано`;
- order `Закрыт`;
- production `Выдано`;
- installation `Выполнен`;
- payment `Оплачено`;
- document `Подписан` or `Аннулирован`.

A terminal state cannot be changed merely by editing a select element.

## Document lifecycle

Future act/document statuses:

`Черновик → Сформирован → Отправлен клиенту → Подписан`

Alternative terminal path:

`Черновик / Сформирован / Отправлен клиенту → Аннулирован`

Target-specific permissions:

- `Черновик` → `documents.create`;
- `Сформирован` → `documents.generate`;
- `Отправлен клиенту` → `documents.send`;
- `Подписан` → `documents.sign`;
- `Аннулирован` → `documents.void`.

## Integration order

1. Keep registry source-only and covered by behavior tests.
2. Replace duplicated UI option arrays one module at a time.
3. Log unknown raw values instead of silently rewriting them.
4. Add action-level checks to Edge/RPC commands.
5. Make server command validate `from`, `to`, permission and current database value.
6. Apply transition and timestamp in one transaction.
7. Add audit event in the same transaction.
8. Add negative integration tests.
9. Only then consider database constraints or enums.

## Server-side target contract

A future transition command should receive:

- domain;
- entity ID;
- expected current status;
- target status;
- optional reason/comment;
- actor context;
- idempotency key.

It should:

1. authenticate the user;
2. load active profile;
3. resolve canonical values;
4. require the registry permission;
5. lock/read the current row;
6. reject stale current status;
7. reject forbidden transition;
8. update status and timestamp;
9. write audit event;
10. return the updated entity.

## Non-goals

- no automatic backfill;
- no historical status rewrite;
- no database enum migration in autonomous mode;
- no UI-only authorization claim;
- no cross-domain transition assumptions;
- no `nav_*` changes.

## Tests

Behavior test:

`node tools/test_crm_status_transitions.mjs`

The test covers:

- production raw labels;
- aliases without `ё`;
- NULL installation normalization;
- allowed and rejected transitions;
- terminal-state protection;
- document permission mapping;
- unknown domain/status handling.

Manual integration evidence remains required when individual CRM modules begin consuming the registry.
