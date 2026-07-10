# CRM + сайт РА «Лидер»: выполнение roadmap — 2026-07-10

Master audit:

`docs/CRM_SITE_FULL_AUDIT_AND_ROADMAP_2026-07-10.md`

Master issue: #200.

Mode: autonomous GitHub source improvements and read-only Supabase verification. Production Supabase mutations remain approval-gated.

## Выполнено в GitHub source

### Публичная форма

- pending `request_id` сохраняется в `sessionStorage`;
- повтор same-payload после сетевого сбоя использует тот же `request_id`;
- duplicate response показывает корректный текст;
- request-reference workflow проверяет retry/duplicate contract.

Manual browser proof всё ещё требуется.

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
- focused issues #201–#205;
- profile-first checker;
- role matrix checker;
- production data-minimization checker;
- public intake cutover checker;
- consolidated full-audit workflow.

## Выполнено read-only в Supabase

- таблицы, FK, RLS и policies проверены;
- 12 лидов и полная воронка агрегированы;
- финансовая арифметика 5 заказов проверена;
- 8 `leader_*` SECURITY DEFINER functions не доступны роли `authenticated`;
- public intake grants/policies подтверждены;
- API/Edge logs просмотрены;
- security/performance advisors проверены;
- production Edge Functions сверены по version/SHA.

## Не выполнено — approval gate

### P0 public intake hardening

- Edge candidate на backend secret/service credential;
- Supabase branch;
- revoke public insert grants;
- removal of public insert policies;
- rate limiter;
- production cutover.

### P0 server-side RBAC

- canonical action permission keys;
- Edge/RPC action checks;
- RLS tightening by business role;
- negative integration tests;
- audit events for privileged actions.

UI restrictions нельзя считать полной изоляцией до этого этапа.

## Не выполнено — source/manual backlog

- browser proof retry idempotency;
- browser proof profile-first scenarios;
- browser/Network proof role and production data minimization;
- `catalog_id` preservation in `calculations.js` (#169);
- backend contract inventory and decision record (#204);
- operational quality panel and queues (#205);
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

1. Add read-only operational quality panel for #205.
2. Inventory direct CRM writes vs Edge/RPC actions for #204.
3. Prepare safe `catalog_id` patch/checker for #169 without risky full-file replacement.
4. Expand manual browser evidence checklists.
5. Keep #200 updated with completed and approval-gated work.
