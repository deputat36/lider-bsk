# Canonical permissions для staging расчётов и КП

Дата: 21 июля 2026 года.

## Причина

Расчёты и коммерческие предложения уже имели JWT-защиту, staging environment guard, строгую валидацию, idempotency и transactional RPC. Локальный список разрешённых ролей создавал второй источник истины рядом с единой SQL-матрицей CRM.

## Решение

Обе Edge Functions используют service-role-only bridge:

`public.leader_actor_has_crm_action_rpc(actor_id, action)`

Он вызывает `leader_private.leader_actor_has_crm_action(actor_id, action)`, который читает активность и роль из `leader_user_profiles`, а разрешения — из `leader_private.leader_role_action_matrix_v1`.

Browser role/permissions не принимаются. Unknown role/action и inactive profile fail closed.

## Порядок

1. Exact staging environment guard.
2. `verify_jwt=true`.
3. Auth user verification.
4. Strict payload validation.
5. Canonical permission RPC.
6. Transactional business RPC.
7. Safe response.

## Расчёты

- function: `leader-crm-calculations`;
- active version: `5`;
- status: `ACTIVE`;
- SHA: `4cd0bde123d6f6c052e0c5337ca01f17a0f76edfb5adf2eed1975e25e39357a4`;
- action: `calculation.create_version`;
- permission: `calculations.write`;
- business RPC: `leader_create_calculation_version_rpc`.

Удалены `CALCULATION_WRITE_ROLES`, `canWriteCalculation` и direct profile lookup для authorization. Payload validation, immutable versions, server totals, locks, idempotency и safe response не менялись.

Version 4 остаётся допустимым быстрым rollback.

## Коммерческие предложения

- function: `leader-crm-offers`;
- active version: `5`;
- status: `ACTIVE`;
- SHA: `b20ffa860121826b265bc01bda3757277573a2e87a2604c0c4764bf4add627a7`;
- action: `offer.create_from_calculation`;
- permission: `offers.write`;
- business RPC: `leader_create_offer_from_calculation_rpc`.

Локального role allowlist нет. `adminFetch` использует typed `Headers`, корректно поддерживая legacy JWT service key и modern secret key. Validation, snapshot, concurrency и idempotency не менялись.

Version 4 остаётся допустимым быстрым rollback.

## Матрица

Для `calculations.write` и `offers.write`:

- owner/admin/manager — разрешено;
- accountant/designer/installer/contractor — запрещено;
- inactive owner — запрещён;
- unknown role — запрещена.

Тест выполнен внутри транзакции; synthetic profiles = 0 после rollback.

## Grants

`leader_actor_has_crm_action_rpc` доступен только postgres и service_role. Anon/authenticated не имеют EXECUTE.

## Проверки

- отсутствие local role helpers;
- отсутствие direct profile authorization;
- JWT и validation до permission decision;
- permission до business RPC;
- exact actions, permissions, versions и hashes;
- calculation/offer unit tests;
- typed Headers;
- production migration boundary;
- advisors.

Authenticated HTTP E2E не выполнялся: тестовый Auth user не создавался. SQL и unit tests не подменяют user-JWT smoke test.

## Production boundary

Production project: `ofewxuqfjhamgerwzull`.

Не выполнялись production Edge deploy, DDL/DML, RLS/grants/functions changes, Auth/Storage/secrets changes или изменение рабочих данных.

Production rollout требует отдельного explicit approval, migration/rollback plan и authenticated role smoke test.
