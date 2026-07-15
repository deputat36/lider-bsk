# Staging transport новой версии расчёта — 2026-07-15

## Назначение

Модуль `calculation-version-staging-transport-v1.js` подготавливает безопасный browser-вызов команды `calculation.create_version` через JWT-защищённую staging Edge Function.

Он не подключён к рабочей кнопке сохранения расчёта и не заменяет текущий production-путь в `calculations.js`.

## Окружения

Staging:

- project ref: `otulfnouybahfnsycxqn`;
- Edge Function: `leader-crm-calculations`;
- active version: `3`;
- deployment hash: `0df6d23cc6d8b19903babbf711bb1da765111ff1f64eb7f8e970f1bcc9760ee4`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- canonical permission label: `calculations.write`.

Production:

- project ref: `ofewxuqfjhamgerwzull`;
- `leader-crm-calculations` отсутствует;
- staging transport при production URL возвращает `wrong_environment` до получения сессии и вызова функции;
- рабочая кнопка CRM не переключается на новый transport этим этапом.

## Canonical permission

Единый UI permission key:

`calculations.write`

Источник:

`CRM_V4_ACTIONS.CALCULATIONS_WRITE` в `action-permissions-v1.js`.

Разрешённые роли:

- owner;
- admin;
- manager.

Accountant, designer, installer, contractor, inactive и unknown должны fail closed.

Ранее использованная строка `calculation.write` была неканоничным информационным label. Авторизация Edge фактически выполняется по активному профилю и allowlist ролей. GitHub source и staging Edge v3 синхронизированы с `calculations.write`.

## Superseded v2

Staging deployment v2 был создан после синхронизации permission label, но при ручной упаковке deploy payload в bundle попала опечатка `normalizeRole(value)` вместо `normalizeRole(role)`.

Post-deploy проверка обнаружила дефект немедленно. v2 сразу заменён v3.

v2:

- не подключался к browser UI;
- не использовался authenticated пользователем;
- не имеет Edge logs за доступный период;
- не создал profiles, calculations, items или receipts;
- не является допустимой rollback-версией.

## Минимальный command envelope

Browser отправляет только:

- `action`;
- `request_id`;
- `expected_updated_at`;
- `payload`.

Payload содержит только:

- `source_calculation_id`;
- `idempotency_key`;
- `title`;
- `need_id`;
- `public_comment`;
- `internal_comment`;
- `items`.

Каждая позиция содержит только:

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

Не передаются:

- actor ID;
- lead ID внутри позиции;
- calculation ID внутри позиции;
- version number;
- status;
- КП/order links;
- client/contractor totals;
- profit;
- markup;
- margin;
- warning level;
- created_by/updated_by.

Все итоги и версия вычисляются сервером.

## Browser flow

1. Проверить, что `supabaseUrl` относится к `otulfnouybahfnsycxqn`.
2. Проверить UI permission `calculations.write`.
3. Взять существующий source calculation с `id` и `updated_at`.
4. Подготовить draft из строк единого конструктора расчёта.
5. Получить текущую JWT-сессию через `client.auth.getSession()`.
6. Вызвать только `client.functions.invoke('leader-crm-calculations', { body: command })`.
7. При HTTP 201 показать новую версию.
8. При HTTP 200 и `idempotent_replay=true` показать безопасный повтор без дубликата.
9. При успехе перечитать список расчётов через отдельный read callback.

Transport не использует:

- `.from(...)`;
- browser INSERT/UPDATE/DELETE/UPSERT;
- browser RPC;
- service role;
- compensating DELETE.

## Ожидаемые результаты

- `201` — новая версия создана;
- `200` — exact replay;
- `400` — invalid payload/items/totals;
- `401` — JWT отсутствует или недействителен;
- `403` — inactive profile или запрещённая роль;
- `404` — source calculation отсутствует;
- `409 source_changed` — источник изменился после чтения;
- `409 idempotency_conflict` — тот же ключ использован с другим payload;
- `409 duplicate_version_inventory` — у заявки есть дубли номеров;
- `409 version_conflict` — параллельная операция заняла номер;
- `500` — безопасная общая ошибка persistence.

## Authenticated positive E2E

На момент обновления runbook staging содержит 0 Auth users. Подключённый Supabase connector не предоставляет безопасные create/delete Auth user operations.

Нельзя:

- вставлять строку напрямую в `auth.users`;
- передавать пароль, access token или refresh token в GitHub;
- использовать production Auth user;
- считать unit-тест transport полноценным HTTP E2E.

Для E2E владелец вручную создаёт временного пользователя только в staging Dashboard. Затем:

1. создать active `leader_user_profiles` row для роли manager;
2. создать synthetic lead/need/source calculation только в staging;
3. войти тестовым пользователем в staging browser session;
4. вызвать transport и подтвердить HTTP 201;
5. повторить exact command и подтвердить HTTP 200 + replay;
6. изменить payload с тем же key и подтвердить HTTP 409;
7. изменить role на accountant и подтвердить HTTP 403 с `permission=calculations.write`;
8. вернуть manager, сделать profile inactive и подтвердить HTTP 403;
9. проверить safe response Network payload;
10. проверить Edge logs и receipt correlation;
11. удалить fixtures, profile, sessions и временного Auth user;
12. подтвердить нулевые staging counters.

## Production boundary

До отдельного решения владельца запрещены:

- импорт transport в production `calculations.js`;
- переключение `saveCalculation()` на Edge;
- включение новой production-кнопки;
- production migration/RPC/index;
- production Edge deployment;
- исправление исторического дубля production;
- автоматическое удаление или перенумерование расчётов.

Следующий safe gate после source-only transport и staging Edge v3 — authenticated staging E2E, затем отдельное staging UI wiring.