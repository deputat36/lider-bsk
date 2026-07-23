# Staging lead workflow command v1

Дата: 23 июля 2026 года.

## Что изменено

На staging `otulfnouybahfnsycxqn` добавлена атомарная команда рабочего маршрута заявки:

- RPC `public.leader_update_lead_workflow_rpc(jsonb)`;
- action `lead_workflow.update`;
- canonical permission `leads.update`;
- staging Edge `leader-crm-leads-staging v4`;
- `verify_jwt=true`;
- Edge SHA `6ee051d0c8db9154c87bdd3b49b1d60b8bf27f6407c9a2843403886b4999868a`.

Migration:

- version `20260723153001`;
- name `staging_lead_workflow_update_rpc_20260723`;
- source `supabase/staging-migrations/20260723_01_lead_workflow_update_rpc.sql`.

## Правила

Guarded workflow fields:

- `status`;
- `next_contact_at`;
- `assigned_to`.

Любое изменение этих полей через staging leads Edge требует:

- `request_id`;
- `expected_updated_at`;
- `idempotency_key`;
- действующий пользовательский JWT;
- canonical permission `leads.update`.

Рабочие статусы требуют ответственного:

- В работе;
- Уточнение деталей;
- Расчёт подготовлен;
- КП отправлено;
- Ждём ответ;
- Нужно пересчитать;
- Согласовано.

Статусы `КП отправлено` и `Ждём ответ` требуют будущий `next_contact_at`.

Назначение в v1 разрешено только на текущего actor. Уже назначенную другому сотруднику заявку перехватить нельзя.

## Совместимость

Legacy non-workflow update fields продолжают направляться в preserved implementation:

- `lead_quality`;
- `estimated_amount`;
- `message`;
- `reject_reason`.

Workflow и legacy поля нельзя смешивать в одном запросе. Такой запрос блокируется до implementation.

## Атомарность

Одна транзакция выполняет:

1. permission recheck;
2. optimistic concurrency check;
3. lead row lock;
4. update заявки;
5. insert события;
6. command receipt completion.

Replay с тем же idempotency key и payload возвращает сохранённый ответ и не создаёт второе событие.

## Acceptance

Rollback-safe acceptance подтвердил:

- `assignee_required` для рабочего статуса без ответственного;
- `forbidden` для accountant;
- запрет назначения на другого сотрудника;
- self-assignment + `В работе`;
- `next_contact_required` для ожидания без будущей даты;
- успешный переход в `Ждём ответ` с будущей датой;
- stale `expected_updated_at` → conflict;
- replay без дублирования события;
- 2 успешные команды → 2 события и 2 receipts;
- внешний `ROLLBACK` удалил всю синтетику.

Acceptance source:

`supabase/staging-tests/20260723_lead_workflow_update_acceptance.sql`

## Postflight

- leads: `0`;
- lead events: `0`;
- workflow receipts: `0`;
- RPC MD5: `6236711baa1a4ba45c9724fb2fe2d2a4`;
- RPC bytes: `12510`;
- RPC EXECUTE: только `service_role`;
- Security Advisor: новых WARN/ERROR нет;
- Performance Advisor: только прежние INFO пустого staging-контура.

Реальный user-JWT Edge smoke в этом этапе не выполнялся, поскольку staging Auth-контур пуст. Следующий gate — отдельный staging frontend transport и authenticated smoke.

## Production boundary

Production `ofewxuqfjhamgerwzull` использован только read-only.

Подтверждено:

- workflow RPC отсутствует;
- migration `20260723153001` отсутствует;
- command receipts table отсутствует;
- production Edge не развёртывался;
- рабочая карточка заявки не переключалась;
- production DDL/DML/Auth/RLS/grants/Storage/data и `nav_*` не менялись.

Production rollout требует отдельного явного согласования.
