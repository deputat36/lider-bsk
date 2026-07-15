# Серверный контракт создания версии расчёта

Дата: 15 июля 2026 года.

Статус: source-only candidate. Не развёрнут в Supabase.

Action: `calculation.create_version`.

## Задача

Создать новый расчёт на основе существующей версии так, чтобы:

- исходный расчёт не изменялся;
- исходные строки не изменялись;
- КП и заказ продолжали ссылаться на исходную версию;
- новая версия получала новый номер без гонок;
- расчёт и все строки сохранялись атомарно;
- повтор запроса не создавал дубликат.

## Транспорт

Кандидат Edge Function: `leader-crm-calculations`.

Требования:

- `verify_jwt=true`;
- browser не вызывает RPC напрямую;
- JWT проверяется сервером;
- service role остаётся только внутри Edge Function;
- actor из payload игнорируется и заменяется данными проверенного JWT.

## Авторизация

Edge Function получает активный профиль из `public.leader_user_profiles`.

Каноническое разрешение: `calculation.write`.

Допустимые роли на первом этапе:

- owner;
- admin;
- manager.

Неизвестная роль, отключённый профиль или отсутствие разрешения должны завершаться отказом до любых записей.

## Входные данные

Обязательные поля:

- `source_calculation_id`;
- `idempotency_key`;
- `expected_source_updated_at`;
- `items`.

Дополнительные поля:

- `title`;
- `need_id`;
- `public_comment`;
- `internal_comment`.

Максимум 200 строк. Пустой список строк запрещён.

## Защита источника

Исходная запись загружается с блокировкой `FOR UPDATE`.

Сервер проверяет:

- существование исходного расчёта;
- принадлежность текущей заявке;
- совпадение `expected_source_updated_at`;
- отсутствие подмены lead/client/actor;
- состояние исторических дублей номера версии.

Запрещены:

- UPDATE исходного расчёта;
- UPDATE или DELETE исходных строк;
- перенос `commercial_offer_id`;
- перенос `order_id`;
- автоматическое перепривязывание существующего КП или заказа;
- автоматическое перенумерование старых записей.

## Новая версия

Новая запись создаётся со следующими правилами:

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

Вся операция выполняется одной транзакцией.

Порядок:

1. Получить advisory transaction lock для `calculation.create_version + lead_id`.
2. Заблокировать исходный расчёт `FOR UPDATE`.
3. Проверить optimistic concurrency через `expected_source_updated_at`.
4. Определить `max(version_number)` для заявки внутри той же блокировки.
5. Назначить `max + 1`.
6. Создать расчёт.
7. Создать все строки.
8. Создать receipt.
9. Зафиксировать транзакцию.

После отдельного исправления исторических дублей должен быть добавлен уникальный индекс `(lead_id, version_number)`.

До этого preflight обязан возвращать `409 duplicate_version_inventory`, если для заявки уже обнаружены повторяющиеся номера.

## Идемпотентность

Используется `leader_private.leader_command_receipts`.

Ключ receipt:

- action: `calculation.create_version`;
- idempotency key;
- SHA-256 canonical payload.

Повтор с тем же ключом и тем же hash возвращает первоначальный успешный результат.

Повтор с тем же ключом и другим hash возвращает `409 idempotency_conflict`.

Receipt, расчёт и строки создаются одной транзакцией.

## Ошибки

- `400 invalid_payload`;
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

## Атомарность

Создание новой версии не должно использовать клиентский compensating DELETE.

Расчёт, строки и receipt либо создаются вместе, либо не создаётся ничего. Это устраняет текущий риск частичного сохранения между отдельными browser INSERT.

## Проверка staging

После отдельного разрешения необходимо проверить:

- параллельные запросы для одного lead;
- одинаковый idempotency key и одинаковый payload;
- одинаковый key и различный payload;
- forced failure при вставке строки;
- forced failure при записи receipt;
- изменение source между чтением и командой;
- source с КП;
- source с заказом;
- duplicate version inventory;
- отсутствие UPDATE/DELETE источника;
- security и performance advisors.

## Rollback

Rollback выполняется app-first:

1. Отключить action в Edge Function.
2. Остановить новые команды.
3. Сохранить уже созданные версии и receipts как доказательство.
4. Не удалять и не перенумеровывать данные автоматически.
5. Откат схемы рассматривать только отдельным согласованным изменением.

## Approval gates

Отдельного разрешения требуют:

- исправление исторического дубля production;
- применение staging migration;
- staging Edge deployment;
- добавление уникального индекса;
- production migration;
- production Edge deployment.

Текущий PR не выполняет ни одно из этих действий.