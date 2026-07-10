# CRM operational quality panel manual test — 2026-07-10

Related: #200, #205.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

## Scope

The panel is a read-only operational snapshot for roles that can open the `Заявки` tab.

It must show aggregate quality gaps without displaying personal data or financial amounts.

## Expected cards

- `Активные без ответственного`;
- `Без следующего контакта`;
- `Потребности ниже 80%`;
- `Заказы`;
- `Записи расходов`;
- `Дизайн-задачи`.

## Current read-only baseline

At the audit snapshot:

- active leads without assignee: 7;
- active leads without next contact: 2;
- needs below 80% completeness: 9;
- orders: 5;
- expenses: 0;
- design tasks: 0.

The live panel may change as CRM data changes. The hardcoded numbers are audit evidence, not UI constants.

## Manual scenarios

1. Log in as owner, admin or manager.
2. Open `Заявки`.
3. Confirm `Операционное качество CRM` appears near the lead summaries.
4. Confirm the panel states that it is read-only and contains no personal data or amounts.
5. Compare the live counts with direct read-only Supabase aggregates.
6. Click `Обновить` and confirm the counts reload.
7. Confirm a loading state appears without blocking the lead list.
8. Simulate one failed query and confirm the panel shows an error while the rest of CRM remains usable.
9. Log in as a role without the leads tab and confirm the panel remains hidden and does not query the quality tables.
10. Confirm the panel cache prevents repeated queries more often than once per minute unless `Обновить` is clicked.

## Network checks

The panel may request only these fields:

- `leader_leads`: `id,status,assigned_to,next_contact_at`;
- `leader_lead_needs`: `id,completeness_score,status`;
- `leader_orders`: `id,status`;
- `leader_expenses`: `id,status`;
- `leader_design_tasks`: `id,task_status`.

The `leader_design_tasks` table uses `task_status`, not a generic `status` column.

It must not request:

- lead name, phone, message or email;
- order client totals, costs, profit or balance;
- payment/expense amounts;
- internal comments.

## Pass criteria

- counts are derived from read-only SELECTs;
- no INSERT, UPDATE or DELETE request is emitted;
- panel access follows the leads-tab UI role guard;
- no personal data or financial amount is displayed;
- panel failure does not break lead loading;
- historical records are not automatically backfilled;
- no Supabase DDL/DML, RLS, grants, Auth or Edge Function change is required.
