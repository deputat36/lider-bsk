# Supabase staging offers Edge v5

## Назначение

Документ фиксирует текущую staging Edge Function для атомарного создания коммерческого предложения из сохранённого расчёта. Имя файла сохранено как исторический стабильный путь CI.

Проект:

- environment: `staging`;
- project ref: `otulfnouybahfnsycxqn`;
- function: `leader-crm-offers v5`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployed SHA-256: `b20ffa860121826b265bc01bda3757277573a2e87a2604c0c4764bf4add627a7`.

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

## Изменение v5

Runtime-логика прав и бизнес-RPC не менялась. `adminFetch` переведён на стандартный `Headers`:

- заголовки имеют однозначный тип для Deno;
- legacy JWT service key получает `Authorization: Bearer ...`;
- modern secret key используется как `apikey` без ошибочного JWT-предположения;
- входные headers безопасно сохраняются через `new Headers(init.headers || {})`.

Эта правка позволила включить строгий `deno check` для фактически развёрнутого offer source.

## Данные и устойчивость

Запрос обязан содержать:

- UUID `request_id`;
- `expected_updated_at`;
- UUID сохранённого расчёта;
- `idempotency_key`;
- заголовок КП;
- дату действия КП;
- необязательный дополнительный комментарий.

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

- `leader-crm-offers v5` ACTIVE;
- `verify_jwt=true`;
- SHA начинается с `b20ffa86`;
- функция использует canonical `offers.write`;
- browser-supplied role отсутствует.

## Rollback

Version 4 с SHA `25b2ff8b11ede3351f95c8f29315b5e43230e5cea153526f75039dc8ff99455e` остаётся валидным rollback. Он использует ту же canonical authorization и business RPC; отличие только в способе построения admin headers.

Rollback не требует DDL, изменения grants или очистки бизнес-данных.

## Production boundary

Не выполнялись:

- production Edge deploy;
- production DDL/DML;
- изменения production RLS/grants/functions;
- изменения Auth, Storage, secrets или рабочих данных;
- перенос staging-файлов в `supabase/migrations`.

Любой production rollout требует отдельного явного согласования и собственной postflight-проверки.
