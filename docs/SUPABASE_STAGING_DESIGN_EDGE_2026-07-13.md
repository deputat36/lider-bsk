# Staging Edge Function для design task — 2026-07-13

## Назначение

`leader-crm-design` — тонкий authenticated Edge-слой над проверенной database RPC `design_task.create_from_order`.

Функция не создаёт task/event/receipt отдельными REST-запросами и не дублирует транзакционную бизнес-логику базы.

## Окружения

- Staging: `otulfnouybahfnsycxqn`.
- Production: `ofewxuqfjhamgerwzull`.
- На этом этапе функция разрешает работу только в staging.

`contract.ts` извлекает project ref из `SUPABASE_URL`. Если ref не равен staging, функция возвращает `503 wrong_environment` до вызова CRM RPC. Это дополнительная защита от случайного production deploy.

## Запрос

Метод: `POST`.

Обязателен gateway `verify_jwt=true` и Bearer JWT пользователя staging Auth.

Browser-request содержит только command envelope:

```json
{
  "action": "design_task.create_from_order",
  "request_id": "UUID v4",
  "expected_updated_at": "ISO datetime",
  "payload": {
    "order_id": "UUID",
    "production_job_id": null,
    "idempotency_key": "design-task:create:...",
    "need_ids": ["UUID"],
    "task": {
      "title": "Макет вывески",
      "priority": "Высокий",
      "deadline": null,
      "task_text": "Техническое задание",
      "reference_link": null
    }
  }
}
```

Browser не передаёт `actor_id`, status, owner, author, designer, client contacts, finance или internal comments.

## Server flow

1. Отклонить неправильное окружение.
2. Проверить метод и размер payload до 64 KiB.
3. Проверить JWT через `/auth/v1/user`.
4. Найти активный `leader_user_profiles` по user ID.
5. Проверить canonical `design.write`.
6. Отклонить unknown/server-owned fields.
7. Минимизировать request.
8. Подставить trusted `actor_id` и `actor_email` из JWT.
9. Вызвать только `leader_create_design_task_from_order_rpc` с service_role.
10. Вернуть safe response или нормализованную ошибку без SQL details.

Allowed roles:

- owner;
- admin;
- manager;
- designer.

Denied/fail-closed:

- accountant;
- installer;
- contractor;
- неканоническая production;
- пустая или неизвестная роль.

## HTTP mapping

- success create → `201`;
- idempotent replay → `200`;
- validation/unknown action → `400`;
- access/permission → `403`;
- missing entity → `404`;
- conflict/duplicate request → `409`;
- transport/persistence failure → `500`.

Raw PostgREST, SQL errors, stack traces и service_role key клиенту не возвращаются.

## CI

Проверяются:

- Deno type check;
- Deno behavior tests;
- exact staging lock;
- `verify_jwt=true`;
- canonical role allowlist;
- запрет browser actor/status/finance fields;
- отсутствие прямых writes в design tables;
- единственный write-path через RPC;
- отсутствие секретов в репозитории.

## Staging deploy

Deploy разрешён только в `otulfnouybahfnsycxqn` после зелёного PR CI.

После deploy нужно проверить:

- функция ACTIVE;
- verify_jwt включён;
- unauthenticated request отклоняется gateway;
- Auth-positive smoke выполняется только после создания отдельного синтетического staging Auth user и active profile;
- synthetic task/event/receipt после smoke удаляются;
- advisors не получают новых WARN/ERROR.

На текущем этапе production deploy запрещён. Чтобы разрешить production, потребуется отдельный PR, удаление staging-only lock, повторное production preflight и явное одобрение владельца.
