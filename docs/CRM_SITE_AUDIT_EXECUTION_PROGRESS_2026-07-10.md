# CRM + сайт РА «Лидер»: выполнение roadmap — 2026-07-10

Master audit:

`docs/CRM_SITE_FULL_AUDIT_AND_ROADMAP_2026-07-10.md`

Master issue: #200.

Mode: autonomous GitHub source improvements and read-only Supabase verification. Production Supabase mutations remain approval-gated.

## Выполнено в GitHub source

### Публичная форма — site-wide retry idempotency

В общем `assets/public-lead-form.js` site-wide shared-form retry idempotency реализована для публичных посадочных страниц:

- pending `request_id` сохраняется в `sessionStorage`;
- повтор same-payload после сетевого сбоя использует тот же `request_id`;
- `+7` и `8` нормализуются по последним 10 цифрам;
- fingerprint хранится как `fnv1a-...`, без исходного телефона и текста заявки;
- pending state очищается только после подтверждённого `data.ok === true`;
- duplicate response показывает корректный текст и серверный номер обращения;
- `assets/public-lead-reference-v1.js` использует тот же fingerprint на `request.html`;
- `tools/test_public_lead_shared_retry.mjs` проверяет поведение автоматически.

Корректировка охвата зафиксирована в `docs/PUBLIC_LEAD_RETRY_COVERAGE_CORRECTION_2026-07-10.md`, ручная матрица — в `docs/PUBLIC_LEAD_SHARED_RETRY_MANUAL_TEST_2026-07-10.md`, задача — #210.

Manual browser proof site-wide retry idempotency всё ещё требуется.

### Profile-first CRM boot

- CRM workspace скрыт до проверки profile;
- `crmReady=true` устанавливается только для `profile.is_active === true`;
- `leader-v4:crm-ready` испускается только после active-profile activation;
- pending/inactive/network/error states не запускают рабочие data loaders;
- добавлены manual test и checker.

Manual browser proof всё ещё требуется.

### Консервативная UI-матрица ролей

- owner/admin: полный набор вкладок;
- manager: заявки, заказы, контроль, производство, контакты, аудит без финансового дашборда;
- accountant: заказы и финансы;
- designer/contractor: production jobs only;
- installer: installation jobs only;
- прямой переход к недоступной вкладке отклоняется;
- restricted `Открыть заказ` action блокируется capture-phase router.

Это defense-in-depth, а не server-side authorization.

### Canonical action registry

Добавлен `crm/v4/assets/v4/action-permissions-v1.js`:

- единые keys для leads, clients, needs, calculations, costs, offers, orders, production, installation, design, finance, catalog, audit, users и settings;
- source role/action baseline;
- UI-only `canPerformV4Action` / `requireV4Action`;
- production kinds и cost visibility используют те же action keys.

Server-side enforcement всё ещё требуется.

### Минимизация данных производства и монтажа

Для restricted roles browser SELECT lists больше не запрашивают:

- `contractor_cost`;
- `contractor_price`;
- `installer_cost`;
- `installer_price`;
- `internal_comment`;
- order `data` JSON;
- staff email в production events.

Designer/contractor не запрашивают installation jobs.

Installer не запрашивает production jobs.

Internal installation comments скрываются от ролей без internal-note access.

Production/installation cards проверяют разрешённый job kind до fetch/save/print.

Manual browser + Network proof всё ещё требуется.

### Read-only operational quality panel

Добавлен `crm/v4/assets/v4/lead-operational-quality-v1.js`.

Панель показывает без персональных данных и сумм:

- активные лиды без ответственного;
- активные лиды без следующего контакта;
- потребности ниже 80%;
- количество заказов;
- количество записей расходов;
- количество дизайн-задач.

Используются только read-only SELECT, role guard и 60-second cache. Схема `leader_design_tasks` учтена корректно через поле `task_status`.

Manual browser proof всё ещё требуется.

### Backend write inventory

Добавлены:

- `docs/CRM_V4_BACKEND_WRITE_CONTRACT_INVENTORY_2026-07-10.md`;
- `docs/CRM_V4_BACKEND_WRITE_INVENTORY_ADDENDUM_2026-07-10.md`;
- `tools/check_crm_v4_backend_write_inventory.py`.

Все найденные CRM v4 JS files с direct insert/update/delete классифицированы.

Новый direct-write module без inventory entry должен остановить workflow.

Определены transaction-backed targets:

- `calculation.save`;
- `offer.create_from_calculation`;
- `offer.transition`;
- `production_job.update`;
- `installation_job.update`;
- manual order transaction.

### Catalog-backed calculation items

`calcItem(raw, index)` теперь сохраняет `catalog_id: raw.catalog_id || null` в payload позиции расчёта.

Добавлены:

- strict checker `tools/check_calculations_catalog_id.py`;
- behavior test `tools/test_calculations_catalog_id.mjs`;
- manual proof `docs/CRM_CALCULATION_CATALOG_ID_MANUAL_TEST_2026-07-10.md`.

Read-only production baseline: столбец `leader_lead_calculation_items.catalog_id` существует; всего 28 позиций, исторических позиций с заполненным `catalog_id` — 0. Исторические данные не переписывались.

Browser/database proof catalog-backed позиции всё ещё требуется по #169.

### Защищённый public intake cutover

Подготовлен, но не применён:

`docs/PUBLIC_INTAKE_SERVICE_ROLE_CUTOVER_PLAN_2026-07-10.md`.

План включает:

- backend secret/service credential;
- removal of public direct insert path;
- rate-limit design;
- Supabase development branch test matrix;
- deployment order;
- rollback.

Production deploy/RLS/grant changes требуют явного approval.

### Аудит и CI

Добавлены:

- master audit;
- execution progress snapshot;
- focused issues #201–#205, #210 и #169;
- profile-first checker;
- role matrix checker;
- production data-minimization checker;
- operational quality checker;
- backend write inventory checker;
- public intake cutover checker;
- public lead shared retry behavior test;
- calculation catalog_id behavior test;
- consolidated full-audit workflow.

## Выполнено read-only в Supabase

- таблицы, FK, RLS и policies проверены;
- 12 лидов и полная воронка агрегированы;
- финансовая арифметика 5 заказов проверена;
- 8 `leader_*` SECURITY DEFINER functions не доступны роли `authenticated`;
- public intake grants/policies подтверждены;
- API/Edge logs просмотрены;
- security/performance advisors проверены;
- production Edge Functions сверены по version/SHA;
- подтверждено наличие `leader_lead_calculation_items.catalog_id` и baseline 28/0 без DML.

## Не выполнено — approval gate

### P0 public intake hardening

- Edge candidate на backend secret/service credential;
- Supabase branch;
- revoke public insert grants;
- removal of public insert policies;
- rate limiter;
- production cutover.

### P0 server-side RBAC

Canonical action permission keys уже подготовлены в source.

Остаются:

- Edge/RPC action checks;
- RLS tightening by business role;
- negative integration tests;
- audit events for privileged actions.

UI restrictions нельзя считать полной изоляцией до этого этапа.

## Не выполнено — source/manual backlog

- browser proof site-wide retry idempotency;
- browser proof request-page retry idempotency;
- browser proof profile-first scenarios;
- browser/Network proof role and production data minimization;
- browser proof operational quality panel;
- browser/database proof catalog_id persistence (#169);
- transaction-backed commands from backend inventory (#204);
- mandatory assignee/SLA;
- needs completeness gate;
- planned vs actual profit;
- expense workflow;
- design task activation;
- centralized status registry;
- consent policy/version marker;
- unified observability dashboard.

## Current production boundary

During autonomous execution:

- no Supabase DDL was executed;
- no Supabase DML was executed;
- no Edge Function was deployed;
- no Auth setting was changed;
- no RLS policy or grant was changed;
- no index was changed;
- no `nav_*` object was modified;
- no historical lead was rewritten.

## Next autonomous source-only sequence

1. Add status/action transition registry for transaction-backed commands.
2. Expand manual browser evidence checklists, including site-wide retry and catalog_id proof.
3. Prepare development-branch test specifications for #201/#202/#204.
4. Keep #200 updated with completed and approval-gated work.
