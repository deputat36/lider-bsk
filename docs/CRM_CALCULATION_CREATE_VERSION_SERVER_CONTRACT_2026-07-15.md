# Серверный контракт создания версии расчёта

Дата: 15 июля 2026 года.

Статус: staging deployed, production gated. Source-only этап завершён.

Action: `calculation.create_version`.

## Окружения

Staging:

- project ref: `otulfnouybahfnsycxqn`;
- database/RPC-контур установлен;
- Edge Function `leader-crm-calculations v1` развёрнута;
- `verify_jwt=true`;
- SQL acceptance и safe-response acceptance пройдены;
- Auth-positive HTTP E2E ещё не выполнен.

Production:

- project ref: `ofewxuqfjhamgerwzull`;
- Edge Function и target RPC отсутствуют;
- рабочая CRM-кнопка не переведена на новый транспорт;
- DDL, DML, RLS, grants, Auth и данные не менялись.

## Задача

Создать новый расчёт на основе существующей версии так, чтобы:

- исходный расчёт не изменялся;
- исходные строки не изменялись;
- КП и заказ продолжали ссылаться на исходную версию;
- новая версия получала новый номер без гонок;
- расчёт и все строки сохранялись атомарно;
- повтор запроса не создавал дубликат.

## Транспорт

Edge Function: `leader-crm-calculations`.

Требования:

- `verify_jwt=true`;
- browser не вызывает RPC напрямую;
- JWT проверяется сервером;
- service role остаётся только внутри Edge Function;
- actor из payload игнорируется и заменяется данными проверенного JWT;
- вне staging source возвращает `wrong_environment`.

## Авторизация

Edge Function получает активный профиль из `public.leader_user_profiles`.

Каноническое разрешение: `calculations.write`.

Источник разрешения: `CRM_V4_ACTIONS.CALCULATIONS_WRITE` в `action-permissions-v1.js`.

Допустимые роли:

- owner;
- admin;
- manager.

Accountant, designer, installer, contractor, неизвестная роль и отключённый профиль должны завершаться отказом до любых записей.

## Входные данные

Envelope:

- `action`;
- `request_id`;
- `expected_updated_at`;
- `payload`.

Обязательные поля payload:

- `source_calculation_id`;
- `idempotency_key`;
- `items`.

Дополнительные поля:

- `title`;
- `need_id`;
- `public_comment`;
- `internal_comment`.

Максимум 200 строк. Пустой список строк запрещён. Idempotency key — не более 160 символов.

Browser может передать в позиции только:

- `catalog_id`;
- `category`;
- `item_type`;
- `name`;
- `unit`;
- `qty`;
- `contractor_price`;
- `client_price`;
- `comment`;
- `data`;
- `sort_order`.

Browser не передаёт суммы, прибыль, маржу, наценку, version number, status, actor, lead/calculation parent IDs, КП или order link.

## Защита источника

Исходная запись загружается с блокировкой `FOR UPDATE`.

Сервер проверяет:

- существование исходного расчёта;
- совпадение `expected_updated_at`;
- принадлежность явно выбранной потребности той же заявке;
- отсутствие подмены actor и server-owned полей;
- состояние исторических дублей номера версии.

Запрещены:

- UPDATE исходного расчёта;
- UPDATE или DELETE исходных строк;
- перенос `commercial_offer_id`;
- перенос `order_id`;
- автоматическое перепривязывание существующего КП или заказа;
- автоматическое перенумерование старых записей.

## Новая версия

Новая запись создаётся по правилам:

- `lead_id` и `client_id` копируются из источника;
- `need_id` копируется либо заменяется явно переданным значением;
- `status='Черновик'`;
- `commercial_offer_id=NULL`;
- `order_id=NULL`;
- `created_by` и `updated_by` равны проверенному actor;
- итоги, прибыль, наценка, маржа и предупреждения пересчитываются сервером;
- клиентская сумма должна быть больше нуля;
- отрицательная прибыль запрещена.

## Номер версии и конкуренция

Вся операция выполняется одной транзакцией:

1. Получить advisory lock по action + idempotency key.
2. Проверить `leader_private.leader_command_receipts`.
3. Заблокировать исходный расчёт `FOR UPDATE`.
4. Получить advisory lock по action + lead ID.
5. Проверить optimistic concurrency через `expected_updated_at`.
6. Заблокировать создание при существующих дублях версий.
7. Определить `max(version_number)` для заявки.
8. Назначить `max + 1`.
9. Создать расчёт и snapshot строк.
10. Сохранить safe response в receipt.

В staging действует unique index `(lead_id, version_number)`.

Read-only production-аудит ранее выявил 11 сохранённых расчётов, 30 строк и одну заявку, где две записи имеют номер версии 1. Production remediation требует отдельного согласования.

## Идемпотентность

Используется `leader_private.leader_command_receipts`.

- тот же key + тот же SHA-256 canonical payload возвращает первоначальный результат;
- тот же key + другой payload возвращает `409 idempotency_conflict`;
- receipt, расчёт и строки создаются одной транзакцией;
- replay возвращает ту же safe projection.

## Safe response

Calculation response содержит только явный allowlist и не возвращает:

- `created_by`;
- `updated_by`;
- `commercial_offer_id`;
- `order_id`.

Item response не возвращает:

- `calculation_id`;
- `lead_id`.

## Ошибки

- `400 invalid_payload`;
- `400 unknown_action`;
- `400 empty_items`;
- `400 invalid_item`;
- `400 invalid_totals`;
- `401 missing_or_invalid_jwt`;
- `403 inactive_profile`;
- `403 forbidden`;
- `404 source_calculation_not_found`;
- `409 source_changed`;
- `409 idempotency_conflict`;
- `409 version_conflict`;
- `409 duplicate_version_inventory`;
- `500 calculation_version_create_failed`.

## Подтверждено в staging

- create version 2;
- server-side totals;
- immutable source;
- exact replay;
- idempotency conflict;
- negative-profit rejection;
- safe response allowlists;
- receipt safe projection;
- browser RPC execute denied;
- service-role RPC execute allowed;
- security WARN/ERROR — 0;
- performance WARN/ERROR — 0;
- fixtures после ROLLBACK — 0.

## Не подтверждено

- authenticated HTTP 201;
- replay HTTP 200;
- modified payload HTTP 409;
- forbidden role HTTP 403;
- inactive profile HTTP 403;
- browser Network safe-response evidence.

Причина: staging содержит 0 Auth users, а connector не предоставляет безопасные create/delete Auth user operations.

## Rollback

Rollback выполняется app-first:

1. Не подключать или отключить browser action.
2. Остановить новые команды.
3. Сохранить созданные версии и receipts как доказательство.
4. Не удалять и не перенумеровывать данные автоматически.
5. Схемный rollback выполнять только отдельной согласованной миграцией.

## Remaining approval gates

Отдельного разрешения требуют:

- временный staging Auth user и authenticated E2E;
- подключение staging transport к тестовому UI;
- исправление исторического дубля production;
- production migration и rollback plan;
- production Edge deployment;
- включение production CRM action.