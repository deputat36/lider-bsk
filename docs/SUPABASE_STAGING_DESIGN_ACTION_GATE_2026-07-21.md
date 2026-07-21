# Staging design action gate

Дата проверки: 21 июля 2026 года.

## Цель

Подключить существующий транспорт создания дизайн-задачи к канонической server-side матрице действий CRM, не переписывая проверенную бизнес-реализацию и не меняя production.

## Архитектура

Исходный staging Edge Function был разделён на два слоя:

- `leader-crm-design v2` — JWT-first authorization wrapper;
- `leader-crm-design-impl v1` — сохранённая реализация `leader-crm-design v1`.

Порядок выполнения wrapper:

1. разрешает только `POST` и `OPTIONS`;
2. проверяет JWT через Supabase Auth;
3. распознаёт только action `design_task.create_from_order`;
4. проверяет canonical permission `design.write` через service-role-only RPC `leader_actor_has_crm_action_rpc`;
5. только после разрешения передаёт исходный JWT и body в implementation.

Unknown action и отказ в permission завершаются до вызова implementation. Роль из browser payload не принимается.

## Сохранённая бизнес-логика

`leader-crm-design-impl v1` сохраняет прежние:

- staging environment guard;
- лимит payload 64 KB;
- проверку активного профиля;
- строгую валидацию envelope и business payload;
- `request_id`, `expected_updated_at` и `idempotency_key`;
- RPC `leader_create_design_task_from_order_rpc`;
- safe error projection;
- replay status 200 и create status 201.

Локальная role-проверка implementation оставлена как defense in depth. Каноническая проверка выполняется раньше, на wrapper-границе.

## Deployment

Фактические staging функции:

- `leader-crm-design v2` — ACTIVE, `verify_jwt=true`, SHA `ea64030d36026762694ae1608fce61a1a58e86569e3cb2fb245b610243b9f91d`;
- `leader-crm-design-impl v1` — ACTIVE, `verify_jwt=true`, SHA `1fe2ad2a48d8f2d9870fdcb0c8a7fb7dfde2c6e12cf0ac274e0511f65e48d8ac`.

## Permission test

Проверка canonical matrix выполнена внутри транзакции с обязательным rollback:

- owner + `design.write` → разрешено;
- designer + `design.write` → разрешено;
- accountant + `design.write` → запрещено;
- inactive designer + `design.write` → запрещено;
- unknown action → запрещено.

Synthetic profiles after rollback = 0.

Реальный user-JWT business smoke не выполнялся: тестовых Auth-пользователей и паролей не создавали. `verify_jwt=true`, JWT-first source order и database permission test подтверждены.

## Rollback

Для мгновенного application rollback достаточно повторно развернуть сохранённый source `leader-crm-design v1` под исходным slug `leader-crm-design`.

`leader-crm-design-impl` можно оставить временно: он не вызывается без корректного JWT и не меняет данные сам по себе до прохождения прежних проверок.

## Production boundary

Не выполнялись:

- production Edge deploy;
- production DDL или DML;
- production RLS, grants или functions changes;
- Auth users, secrets или Storage changes;
- создание или изменение заявок, заказов, дизайн-задач и событий.

Production rollout требует отдельного явного approval и отдельного rollback-плана.
