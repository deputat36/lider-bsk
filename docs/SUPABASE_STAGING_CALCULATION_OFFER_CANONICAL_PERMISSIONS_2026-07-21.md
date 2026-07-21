# Canonical permissions для staging расчётов и КП

Дата: 21 июля 2026 года.

## Причина

`leader-crm-calculations` и `leader-crm-offers` уже имели JWT-защиту, staging environment guard, строгую валидацию, idempotency и transactional RPC. Однако каждая функция отдельно хранила локальный список разрешённых ролей owner/admin/manager.

После появления единой server-side матрицы это стало вторым источником истины и создавало риск расхождения интерфейса, Edge Functions и базы данных.

## Решение

Обе staging Edge Functions используют один service-role-only bridge:

`public.leader_actor_has_crm_action_rpc(actor_id, action)`

Bridge вызывает приватный helper:

`leader_private.leader_actor_has_crm_action(actor_id, action)`

Роль и активность пользователя читаются только из `leader_user_profiles`, а разрешение — из `leader_private.leader_role_action_matrix_v1`.

Browser не передаёт роль или список разрешений. Unknown role, unknown action и inactive profile блокируются.

## Порядок выполнения

1. Exact staging environment guard.
2. Платформенная проверка `verify_jwt=true`.
3. Проверка пользователя через Auth endpoint.
4. Парсинг и строгая валидация payload.
5. Canonical permission RPC.
6. Только после разрешения — transactional business RPC.
7. Safe response projection.

## Расчёты

Функция: `leader-crm-calculations`.

- active version: `5`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4`;
- action: `calculation.create_version`;
- permission: `calculations.write`;
- business RPC: `leader_create_calculation_version_rpc`.

Удалены runtime-зависимости:

- `CALCULATION_WRITE_ROLES`;
- `canWriteCalculation`;
- прямое чтение профиля Edge-функцией для принятия решения о доступе.

Payload validation, immutable versioning, server-side totals, optimistic concurrency, locks, idempotency receipts и safe response не менялись.

Version 4 остаётся допустимым быстрым rollback: runtime уже использовал canonical permission RPC, но bundle содержал неиспользуемый legacy helper ролей.

## Коммерческие предложения

Функция: `leader-crm-offers`.

- active version: `4`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `25b2ff8b11ede3351f95c8f29315b5e43230e5cea153526f75039dc8ff99455e`;
- action: `offer.create_from_calculation`;
- permission: `offers.write`;
- business RPC: `leader_create_offer_from_calculation_rpc`.

Удалены runtime-зависимости:

- `OFFER_WRITE_ROLES`;
- `canWriteOffer`;
- прямое чтение профиля Edge-функцией для принятия решения о доступе.

Payload validation, calculation snapshot, valid-until validation, idempotency и transactional persistence не менялись.

Version 3 остаётся допустимым быстрым rollback по той же причине: canonical gate уже использовался, но contract bundle содержал неиспользуемый helper ролей.

## Фактическая матрица

Для `calculations.write` и `offers.write`:

- owner — разрешено;
- admin — разрешено;
- manager — разрешено;
- accountant — запрещено;
- designer — запрещено;
- installer — запрещено;
- contractor — запрещено;
- inactive owner — запрещено;
- unknown role — запрещено.

Полный тест выполнен внутри транзакции. После `ROLLBACK` synthetic profiles = 0.

## Grants

`leader_actor_has_crm_action_rpc` доступен только:

- postgres;
- service_role.

Anon и authenticated не имеют EXECUTE. Роль из browser payload не принимается.

## Проверки

Добавлены проверки:

- отсутствие локальных role allowlists;
- отсутствие прямого profile lookup для authorization;
- JWT до permission decision;
- payload validation до permission RPC;
- permission RPC до business RPC;
- точные actions и permission keys;
- точные staging versions и hashes;
- unit tests расчётного и offer contract;
- production migration boundary;
- security/performance advisors.

Реальный authenticated HTTP E2E не выполнялся: временный Auth user не создавался. Это не заменяется unit-тестом. Для окончательного browser smoke нужен отдельный staging пользователь и последующая полная очистка.

## Production boundary

Production project: `ofewxuqfjhamgerwzull`.

Не выполнялись:

- production Edge deploy;
- production DDL/DML;
- production RLS/grants/function changes;
- Auth user creation;
- secrets или Storage changes;
- создание или изменение расчётов, КП, заявок, заказов, платежей и расходов.

Production rollout требует отдельного explicit approval, production migration/rollback plan и role-based authenticated smoke test.
