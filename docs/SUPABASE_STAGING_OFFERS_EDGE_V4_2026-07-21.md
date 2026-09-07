# Supabase staging offers Edge v6

## Назначение

Документ фиксирует текущую staging Edge Function для атомарного создания коммерческого предложения из сохранённого расчёта. Имя файла сохранено как исторический стабильный путь CI.

Проект:

- environment: `staging`;
- project ref: `otulfnouybahfnsycxqn`;
- function: `leader-crm-offers v6`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployed SHA-256: `c84c442fefadebca33de08f480e85d852d0b1a4bbf5e871e8992adbe004329e6`.

## Контракт действия

- action: `offer.create_from_calculation`;
- canonical permission: `offers.write`;
- permission RPC: `leader_actor_has_crm_action_rpc`;
- transactional business RPC: `leader_create_offer_from_calculation_rpc`.

Порядок выполнения:

1. Проверяется staging project ref.
2. Проверяется JWT пользователя.
3. Валидируется закрытый envelope запроса.
4. Через service/secret key проверяется canonical `offers.write`.
5. Только после разрешения вызывается transactional RPC.

Роль из browser payload не принимается. Unknown action, лишние поля, отсутствующие idempotency/concurrency данные и недопустимые даты отклоняются до бизнес-записи.

## Изменение v6

Добавлен явный privacy-флаг `include_client_details`:

- отсутствующий флаг нормализуется в `false`;
- `false` — новое КП не содержит имени и телефона клиента;
- `true` — имя и телефон добавляются только по явному решению сотрудника;
- флаг входит в normalized payload и idempotency hash, поэтому запросы с разным режимом приватности не считаются одинаковыми;
- unknown/server-owned поля по-прежнему отклоняются.

Runtime-логика canonical permission не менялась. `adminFetch` по-прежнему использует typed `Headers`, поддерживает legacy JWT service key и modern secret key.

## Данные и устойчивость

Запрос обязан содержать:

- UUID `request_id`;
- `expected_updated_at`;
- UUID сохранённого расчёта;
- `idempotency_key`;
- заголовок КП;
- дату действия КП;
- необязательный дополнительный комментарий;
- необязательный boolean `include_client_details`, default `false`.

Тоталы и связанные сущности вычисляются и проверяются сервером. Успешный idempotent replay возвращает HTTP 200, новая запись — HTTP 201.

## Источник истины

- `supabase/staging-functions/leader-crm-offers/index.ts`;
- `supabase/staging-functions/leader-crm-offers/contract.ts`;
- `supabase/staging-functions/leader-crm-offers/contract_test.ts`;
- `contracts/crm-staging-offers-edge-deployment-v1.json`;
- `contracts/crm-staging-calc-offer-canonical-permissions-v1.json`.

Checker контролирует action/permission, порядок JWT → validation → permission → RPC, закрытый payload, typed Headers, deployed version/hash и отсутствие staging-артефактов в production migrations.

## Проверка после deployment

Management API показал:

- `leader-crm-offers v6` ACTIVE;
- `verify_jwt=true`;
- SHA начинается с `c84c442f`;
- функция использует canonical `offers.write`;
- browser-supplied role отсутствует.

Транзакционный staging privacy-test подтвердил оба режима и завершился rollback. После проверки synthetic leads/calculations/offers/receipts/profiles = 0.

## Rollback

Version 5 с SHA `b20ffa860121826b265bc01bda3757277573a2e87a2604c0c4764bf4add627a7` остаётся валидным rollback Edge bundle.

Rollback Edge не требует изменения таблиц. Privacy-совместимость RPC сохраняет старый payload без `include_client_details`, нормализуя его в `false`.

## Production boundary

Не выполнялись:

- production Edge deploy;
- production DDL/DML;
- изменения production RLS/grants/functions;
- изменения Auth, Storage, secrets или рабочих данных;
- перенос staging-файлов в `supabase/migrations`.

Любой production rollout требует отдельного явного согласования и собственной postflight-проверки.
