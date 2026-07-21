# Staging Production command Edge v1

Дата фиксации: 21 июля 2026 года.

## Цель

Подготовить source-only Edge transport для атомарной команды `production_job.update`, не меняя staging deployment, production Supabase и рабочие данные.

Сейчас frontend `production-job-card-v2.js` выполняет три последовательные браузерные операции:

1. UPDATE `leader_production_jobs`;
2. UPDATE связанного `leader_orders`;
3. INSERT `leader_production_events`.

Ошибка между шагами может оставить частично обновлённое состояние.

## Найденный staging RPC

В staging уже существует:

`public.leader_update_production_job_rpc(jsonb)`

Фактический baseline:

- project ref: `otulfnouybahfnsycxqn`;
- SECURITY INVOKER;
- `search_path=''`;
- размер определения: 15485 байт;
- MD5 определения: `53380fb1798f4e4ab25c7d9b98ae2562`;
- EXECUTE для `service_role`: разрешено;
- EXECUTE для `authenticated`: запрещено;
- EXECUTE для `anon`: запрещено.

RPC в одной транзакции обновляет:

- `leader_production_jobs`;
- связанный `leader_orders`;
- `leader_production_events`;
- `leader_private.leader_command_receipts`.

Он проверяет `expected_updated_at`, `idempotency_key`, допустимость перехода статуса и server-side права.

## Source-only Edge candidate

Файлы:

- `supabase/staging-functions/leader-crm-production/index.ts`;
- `supabase/staging-functions/leader-crm-production/contract.ts`.

Предлагаемый slug:

`leader-crm-production`

Новый deploy в этом PR не выполняется.

Порядок обработки:

1. точный staging environment guard;
2. JWT-проверка через `/auth/v1/user`;
3. строгая валидация envelope и patch;
4. canonical `production.write`;
5. дополнительный `orders.update`, если изменяется `internal_comment`;
6. вызов `leader_update_production_job_rpc` через admin key.

Browser-supplied role не используется.

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

Server-owned timestamps и audit-поля браузером не передаются.

## Что пока не выполнено

- Edge Function не развёрнута;
- frontend не переключён с прямых записей;
- staging Auth smoke с реальным user JWT не выполнялся;
- installation command не создавалась, потому что в текущем staging отсутствуют таблицы монтажа;
- production rollout не выполнялся.

## Следующий rollout gate

1. Развернуть `leader-crm-production` только на staging с `verify_jwt=true`.
2. Проверить owner/admin/manager и отрицательные роли.
3. Выполнить идемпотентный replay и stale `expected_updated_at` тест.
4. Убедиться, что транзакционный rollback не оставляет fixtures.
5. Переключить только staging frontend на Edge transport.
6. После успешной визуальной и бизнес-проверки подготовить отдельный production approval и rollback.

## Автоматическая защита

Machine-readable контракт:

`contracts/crm-staging-production-command-edge-v1.json`

Checker:

`tools/check_crm_staging_production_command_edge.py`

Workflow:

`.github/workflows/crm-staging-production-command-edge-check.yml`

Checker фиксирует RPC fingerprint, grants, порядок environment → JWT → validation → permissions → RPC, отсутствие browser role, source-only статус и текущий frontend drift.

## Production boundary

Production project `ofewxuqfjhamgerwzull` не изменён.

Не выполнялись DDL/DML, Edge deploy, RLS/grants, Auth, Storage, secrets или изменение рабочих заявок, заказов и производственных заданий.
