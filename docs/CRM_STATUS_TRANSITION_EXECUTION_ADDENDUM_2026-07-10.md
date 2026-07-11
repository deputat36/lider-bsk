# CRM status transition execution addendum — 2026-07-10

Related: #200, #202, #204, #205, #214, #217.

This addendum supplements `docs/CRM_SITE_AUDIT_EXECUTION_PROGRESS_2026-07-10.md`.

## Status correction

The backlog line `centralized status registry` in the earlier execution snapshot is now resolved in GitHub source.

Implemented:

- `crm/v4/assets/v4/status-transitions-v1.js`;
- `docs/CRM_STATUS_TRANSITION_REGISTRY_2026-07-10.md`;
- `tools/check_crm_status_transition_registry.py`;
- `tools/test_crm_status_transitions.mjs`;
- `.github/workflows/crm-status-transition-registry-check.yml`;
- status registry validation in `.github/workflows/crm-site-full-audit-check.yml`.

Registry domains:

- leads;
- commercial offers;
- orders;
- layout;
- production;
- installation;
- order payment state;
- payment records;
- design tasks;
- future order documents.

Each status defines:

- canonical key;
- Russian label;
- aliases;
- terminal flag;
- allowed targets;
- permission;
- timestamp field;
- audit event.

## Read-only production evidence

Distinct production values were read without DML for:

- `leader_leads.status`;
- `leader_commercial_offers.status`;
- `leader_orders.status`;
- `leader_orders.payment_status`;
- `leader_orders.layout_status`;
- `leader_orders.production_status`;
- `leader_orders.installation_status`;
- `leader_design_tasks.task_status`;
- `leader_production_jobs.production_status`;
- `leader_production_jobs.layout_status`;
- `leader_installation_jobs.install_status`;
- `leader_payments.payment_status`.

The registry includes all values currently observed in non-empty production domains, including NULL installation state normalization.

The 2026-07-11 read-only `leader_leads.status` snapshot contains only known values:

- `Новая` — 3;
- `Уточнение деталей` — 1;
- `Расчёт подготовлен` — 2;
- `КП отправлено` — 1;
- `Создан заказ` — 5.

The 2026-07-11 read-only production snapshot contains:

- `leader_production_jobs.production_status`: `Не передано` — 1, `В производстве` — 1;
- `leader_orders.production_status`: `Не передано` — 3, `В производстве` — 1, `Выдано` — 1.

The 2026-07-11 read-only installation snapshot contains:

- `leader_installation_jobs.install_status`: `Запланирован` — 1;
- `leader_orders.installation_status`: NULL — 2, `Запланирован` — 1, `Не назначен` — 1, `Не требуется` — 1.

No production or installation row was changed during the snapshots.

## First module adoption

`crm/v4/assets/v4/lead-operational-quality-v1.js` now uses:

`statusDefinition('lead', lead.status)`

for terminal lead detection.

The previous duplicate hardcoded terminal-status Set was removed.

This first adoption is read-only and affects only operational queue membership. It does not update lead statuses.

The operational panel now provides read-only queues for:

- active leads without assignee;
- active leads without next contact;
- overdue next contacts;
- needs below 80% completeness.

Queue rows intentionally exclude name, phone, message, email, addresses, internal comments and financial values.

## Second module adoption — lead status UI

Added:

- `crm/v4/assets/v4/lead-status-ui-model-v1.js`;
- `crm/v4/assets/v4/lead-status-ui-registry-v1.js`;
- `tools/test_crm_lead_status_ui.mjs`;
- `tools/check_crm_lead_status_ui_registry.py`;
- `docs/CRM_LEAD_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md`.

The adapter is loaded through `lead-analytics-badges-v1.js` and does not replace the large legacy lead modules.

It now:

- builds known lead-status filter options from `status-transitions-v1.js`;
- preserves unknown raw statuses as exact filter values;
- marks unknown status chips without rewriting stored rows;
- renders only registry-allowed quick transitions in the lead card;
- hides the list-level `В работу` action when the transition is invalid;
- blocks disallowed status clicks in capture phase before legacy delegated handlers;
- blocks the hidden legacy `Новая → Ждём ответ` transition caused by setting the next contact before moving the lead to work;
- adds no Supabase read or write path of its own.

Unknown raw values remain visible and cannot transition until an explicit mapping is added to the canonical registry.

## Third module adoption — commercial-offer status UI

Added:

- `crm/v4/assets/v4/offer-status-ui-model-v1.js`;
- `tools/test_crm_offer_status_ui.mjs`;
- `tools/check_crm_offer_status_ui_registry.py`;
- `docs/CRM_OFFER_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md`.

The existing `offers.js` module now:

- renders offer actions from registry-allowed transitions;
- blocks the legacy direct `Черновик → Согласовано` and `Черновик → Отклонено` paths;
- validates every status update before the existing Supabase write;
- uses canonical new sent status `Отправлено`;
- keeps legacy `КП отправлено` readable through an alias without rewriting the row on render;
- preserves and visibly marks unknown raw offer statuses while exposing no transition action;
- derives `sent_at`, `approved_at` and `rejected_at` from registry metadata;
- retains existing linked lead/calculation synchronization for valid transitions;
- adds an UI permission guard for `offers.transition`.

The pure offer status model adds no Supabase read or write path. Existing offer writes remain direct and are not server-side transactional enforcement.

## Fourth module adoption — order status views

Added:

- `crm/v4/assets/v4/order-status-ui-model-v1.js`;
- `tools/test_crm_order_status_ui.mjs`;
- `tools/check_crm_order_status_ui_registry.py`;
- `docs/CRM_ORDER_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md`.

Registry-backed read-only classification is now used by:

- the order block inside the lead card;
- the fast all-orders list;
- the order-control dashboard;
- the full order modal.

The adoption:

- removes duplicate terminal-status sets from the fast list and order-control dashboard;
- uses registry keys for active counters, deadlines and progress stages;
- recognizes legacy `Отмена` as cancelled without rewriting it;
- keeps unknown orders visible and active instead of silently hiding them;
- displays an explicit unknown-status warning;
- adds no order status update control and no new Supabase write path.

General order transitions remain read-only in the current UI. Production, layout, installation and payment fields continue to be separate domains.

## Fifth module adoption — production job status editor

Added:

- `crm/v4/assets/v4/production-status-ui-model-v1.js`;
- `tools/test_crm_production_status_ui.mjs`;
- `tools/check_crm_production_status_ui_registry.py`;
- `docs/CRM_PRODUCTION_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md`.

The existing `production-job-card-v2.js` now:

- builds its status select from registry-allowed targets;
- validates the selected transition before the existing job/order/event write path;
- writes canonical status labels only for real transitions;
- preserves an unchanged legacy or unknown raw status while other fields are edited;
- blocks transitions from unknown and terminal statuses before any Supabase write;
- recognizes legacy UI values `Передано в производство`, `В работе` and `Проблема` without rewriting them on render;
- maps transition timestamps only to existing columns `sent_to_contractor_at`, `ready_at` and `issued_at`;
- does not write the registry-only `started_at` field because it is absent from `leader_production_jobs`;
- keeps the existing direct multi-table write path visible as technical debt tracked by #202/#204.

The production model itself is side-effect free and creates no Supabase client, REST, RPC or Edge path.

## Sixth module adoption — installation job status editor

Added:

- `crm/v4/assets/v4/installation-status-ui-model-v1.js`;
- `tools/test_crm_installation_status_ui.mjs`;
- `tools/check_crm_installation_status_ui_registry.py`;
- `docs/CRM_INSTALLATION_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md`.

The existing `installation-job-card-v2.js` now:

- builds the status select from registry-allowed installation targets;
- validates the transition before the existing job/order/event write path;
- preserves a NULL `install_status` when other fields are saved without a status change;
- writes a canonical label only after a real transition;
- preserves unchanged legacy or unknown raw status values;
- recognizes legacy `Нужно назначить` as `Не назначен` and `Проблема` as `Перенесён`;
- blocks unknown, terminal and forbidden transitions before any Supabase write;
- maps timestamps only to live columns `started_at` and `completed_at`;
- does not write missing `postponed_at` or `cancelled_at` columns;
- keeps the existing direct multi-table write path visible as technical debt tracked by #202/#204.

The installation model itself is side-effect free and creates no Supabase client, REST, RPC or Edge path.

## Still open

The following work remains open and must not be confused with registry creation or completed UI adoptions:

1. Replace heuristic production/installation completion classifiers in the shared board with registry-backed read-only classification.
2. Add controlled logging/evidence for unknown raw values without rewriting them.
3. Use registry validation in future Edge/RPC transition commands.
4. Check canonical action permission server-side.
5. Apply status, timestamp and audit event transactionally.
6. Add development-branch negative tests for forbidden, stale and concurrent transitions.
7. Decide separately whether any database constraints are appropriate.
8. Complete browser/Network verification from the manual-test documents.

## Approval boundary

No production status rows were changed.

No enum, constraint, trigger, RLS policy, grant, Edge Function or RPC was changed.

No `nav_*`, `nav-*`, `parket-*` or `broker-*` object was touched.

Server-side transition enforcement remains tracked in #202 and #204.
