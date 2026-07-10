# CRM operational quality panel manual test — 2026-07-10

Related: #200, #205, #217.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

## Scope

The panel is a read-only operational snapshot and queue launcher for roles that can open the `Заявки` tab.

Aggregate cards must not display personal data or financial amounts.

Problem queues may display only the minimum fields required to identify the workflow gap:

- short record ID;
- service;
- source;
- status;
- created/updated time;
- next-contact time;
- completeness percentage.

## Expected cards

- `Активные без ответственного`;
- `Без следующего контакта`;
- `Просрочен контакт`;
- `Потребности ниже 80%`;
- `Заказы`;
- `Записи расходов`;
- `Дизайн-задачи`.

## Current read-only baseline

At the 2026-07-10 audit snapshot:

- active leads without assignee: 7;
- active leads without next contact: 2;
- active overdue contacts: 5;
- needs below 80% completeness: 9;
- orders: 5;
- expenses: 0;
- design tasks: 0.

The live panel may change as CRM data changes. The hardcoded numbers are audit evidence, not UI constants.

## Manual scenarios

1. Log in as owner, admin or manager.
2. Open `Заявки`.
3. Confirm `Операционное качество CRM` appears near the lead summaries.
4. Confirm the panel states that it is read-only.
5. Compare the live counts with direct read-only Supabase aggregates.
6. Click each non-zero problem card:
   - `Активные без ответственного`;
   - `Без следующего контакта`;
   - `Просрочен контакт`;
   - `Потребности ниже 80%`.
7. Confirm each click opens a modal queue with the correct title and workflow hint.
8. Confirm lead queues show service, source, status, short ID, created time and next-contact time only.
9. Confirm the incomplete-needs queue shows short need ID, short lead ID, completeness, status and updated time only.
10. Open one row with `Открыть заявку`.
11. Confirm the modal closes and the matching lead card opens.
12. Confirm the lead can be opened even when it is not currently visible in the first rendered list page.
13. Close the queue with the close button, backdrop and Escape key.
14. Click `Обновить` and confirm the counts and currently open queue reload.
15. Confirm a loading state appears without blocking the lead list.
16. Simulate one failed query and confirm the panel shows an error while the rest of CRM remains usable.
17. Log in as a role without the leads tab and confirm the panel remains hidden and does not query the quality tables.
18. Confirm the panel cache prevents repeated queries more often than once per minute unless `Обновить` is clicked.

## Network checks

The panel may request only these fields:

- `leader_leads`: `id,status,assigned_to,next_contact_at,created_at,service,source`;
- `leader_lead_needs`: `id,lead_id,completeness_score,status,created_at,updated_at`;
- `leader_orders`: `id,status`;
- `leader_expenses`: `id,status`;
- `leader_design_tasks`: `id,task_status`.

The `leader_design_tasks` table uses `task_status`, not a generic `status` column.

It must not request:

- lead name, phone, message or email;
- client phone;
- order client totals, costs, profit or balance;
- payment/expense amounts;
- internal comments;
- full order/lead JSON payloads.

## Privacy checks

- no personal data or financial amount is displayed in the aggregate cards;
- no lead name, phone, message or email is displayed in the queue;
- no client phone or address is displayed in the queue;
- opening the lead happens only after the user explicitly clicks `Открыть заявку`;
- the regular lead card remains responsible for displaying authorised CRM details.

## Status-registry check

The panel must determine terminal lead states through:

`statusDefinition('lead', lead.status)`

It must not maintain a separate hardcoded terminal-status Set.

Confirm that leads in terminal statuses such as `Создан заказ`, `Отказ` or `Спам` do not enter active operational queues.

## Pass criteria

- counts and queue rows are derived from read-only SELECTs;
- no INSERT, UPDATE or DELETE request is emitted;
- panel access follows the leads-tab UI role guard;
- queue access does not bypass the normal lead-card route;
- terminal lead detection uses the canonical status registry;
- no personal data or financial amount is displayed in the aggregate cards;
- no lead name, phone, message or email is displayed in the queue;
- panel failure does not break lead loading;
- historical records are not automatically backfilled;
- no Supabase DDL/DML, RLS, grants, Auth or Edge Function change is required.
