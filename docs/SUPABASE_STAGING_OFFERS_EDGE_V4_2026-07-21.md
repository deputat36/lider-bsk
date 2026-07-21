# Supabase staging offers Edge v4

## Назначение

Этот документ фиксирует фактически развёрнутую staging-версию Edge Function для атомарного создания коммерческого предложения из сохранённого расчёта.

Проект:

- environment: `staging`;
- project ref: `otulfnouybahfnsycxqn`;
- function: `leader-crm-offers v4`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployed SHA-256: `25b2ff8b11ede3351f95c8f29315b5e43230e5cea153526f75039dc8ff99455e`.

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

В репозитории сохранены точные файлы текущего deployment:

- `supabase/staging-functions/leader-crm-offers/index.ts`;
- `supabase/staging-functions/leader-crm-offers/contract.ts`;
- `contracts/crm-staging-offers-edge-deployment-v1.json`.

Checker контролирует action/permission, порядок JWT → validation → permission → RPC, закрытый payload, deployed version/hash и отсутствие staging-артефактов в production migrations.

## Проверка после синхронизации

Management API повторно показал:

- `leader-crm-offers v4` ACTIVE;
- `verify_jwt=true`;
- SHA начинается с `25b2ff8b`;
- функция использует canonical `offers.write`;
- browser-supplied role отсутствует.

Новый deployment в этом изменении не выполнялся: репозиторий синхронизирован с уже работающей staging-версией.

## Rollback

Rollback выполняется повторным развёртыванием предыдущего проверенного source/version под slug `leader-crm-offers`. Перед откатом нужно сохранить текущий v4 source и повторно проверить `verify_jwt`, project guard и grants вызываемых RPC.

## Production boundary

Не выполнялись:

- production Edge deploy;
- production DDL/DML;
- изменения production RLS/grants/functions;
- изменения Auth, Storage, secrets или рабочих данных;
- перенос staging-файлов в `supabase/migrations`.

Любой production rollout требует отдельного явного согласования и собственной postflight-проверки.
