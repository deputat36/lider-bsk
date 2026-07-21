# Staging Production command Edge v2

Дата фиксации: 21 июля 2026 года.

## Назначение

Команда `production_job.update` заменяет три потенциально расходящихся browser write одной транзакцией:

1. UPDATE `leader_production_jobs`;
2. UPDATE связанного `leader_orders`;
3. INSERT `leader_production_events`;
4. INSERT idempotency receipt.

Рабочий frontend пока не переключён. Новая серверная цепочка развёрнута и проверена только в staging.

## Фактический deployment

Проект: `otulfnouybahfnsycxqn`.

Database:

- migration version: `20260721141942`;
- name: `staging_production_job_update_rpc_20260721`;
- RPC: `public.leader_update_production_job_rpc(jsonb)`;
- SECURITY INVOKER;
- `search_path=''`;
- размер определения: 15485 байт;
- MD5: `53380fb1798f4e4ab25c7d9b98ae2562`;
- EXECUTE: только `service_role`.

Edge:

- slug: `leader-crm-production`;
- version: `2`;
- status: ACTIVE;
- `verify_jwt=true`;
- SHA-256: `c6b0e1e4081c20872e3fdbdd80bc55b00aecdc063e7656f4a263e8a7f34638aa`.

Предыдущая staging Edge v1 сохранена как rollback evidence:

- SHA-256: `f378dc44bae1c4dd5627d2c0068f28b1c3cebe9d5e9b3e18ac01d55d59af060d`.

## Порядок обработки

1. exact staging environment guard;
2. платформенный `verify_jwt=true`;
3. Auth user verification через `/auth/v1/user`;
4. строгая валидация envelope, payload и patch;
5. canonical `production.write`;
6. дополнительный canonical `orders.update` для `internal_comment`;
7. transactional `leader_update_production_job_rpc`;
8. privacy-safe response.

Permission checks выполняются на Edge для быстрого отказа и повторно внутри RPC. Browser-supplied role и actor ID не используются.

## Роли и поля

`production.write` разрешён owner, admin, manager, designer и contractor.

`internal_comment` дополнительно требует `orders.update`, поэтому доступен только owner, admin и manager.

Accountant, installer, inactive profile и unknown role блокируются.

## Контракт запроса

```json
{
  "action": "production_job.update",
  "request_id": "uuid",
  "expected_updated_at": "ISO datetime",
  "payload": {
    "job_id": "uuid",
    "idempotency_key": "1..160 chars",
    "patch": {
      "title": "...",
      "production_status": "...",
      "layout_status": "...",
      "priority": "...",
      "deadline": "ISO datetime or null",
      "file_url": "...",
      "technical_task": "...",
      "contractor_comment": "...",
      "internal_comment": "..."
    }
  }
}
```

Server-owned timestamps, связи, audit fields, стоимость и суммы отклоняются до RPC.

## Atomicity и concurrency

RPC:

- блокирует job и связанный order `FOR UPDATE`;
- сравнивает `expected_updated_at`;
- использует advisory locks для idempotency key и request ID;
- валидирует transition по canonical production registry;
- назначает `sent_to_contractor_at`, `ready_at`, `issued_at` сервером;
- обновляет job и order;
- создаёт event и receipt в одной транзакции.

Принудительный trigger failure на INSERT события подтвердил rollback job, order, event и receipt.

## Acceptance

`supabase/staging-tests/20260721_production_job_update_acceptance.sql` успешно проверил:

- manager success;
- contractor success для обычного production comment;
- contractor deny для `internal_comment`;
- accountant, installer, inactive и unknown deny;
- job/order/event synchronization;
- safe response;
- exact replay без дублей;
- changed payload conflict;
- stale source conflict;
- invalid transition;
- forced event failure и полный rollback.

После `ROLLBACK` synthetic profiles, orders, jobs, events и receipts равны `0`.

## Safe response

Ответ не содержит:

- `internal_comment`;
- `contractor_cost`;
- `client_total`;
- `owner_id`;
- `created_by`;
- `created_by_email`.

## Автоматическая защита

Machine-readable contracts:

- `contracts/crm-staging-production-command-edge-v1.json`;
- `contracts/production-job-update-v1.json`.

Checks:

- Deno type-check;
- Deno contract tests;
- RPC fingerprint и grants;
- source execution order;
- status registry parity;
- acceptance/cleanup markers;
- отсутствие staging command в production migrations;
- неизменность frontend baseline.

## Оставшийся gate

Authenticated HTTP E2E пока не выполнен: временный staging Auth user не создавался.

Frontend остаётся на текущем browser path. Staging transport и production rollout нельзя включать до отдельного authenticated role smoke test.

## Production boundary

Production project `ofewxuqfjhamgerwzull` не изменён.

Не выполнялись:

- production Edge deploy;
- production migration/RPC;
- production RLS/grants/functions changes;
- Auth/Storage/secrets changes;
- изменение рабочих заказов, заданий и событий.

Production rollout требует отдельного explicit approval и production-specific rollback plan.
