# Staging transport новой версии расчёта — 2026-07-15

## Назначение

Модуль `calculation-version-staging-transport-v1.js` подготавливает безопасный browser-вызов команды `calculation.create_version` через JWT-защищённую staging Edge Function.

Transport подключён к редактору только при exact staging URL. Production URL использует `production_locked`: редактор не выполняет browser write и не вызывает staging Edge Function.

Основной `calculations.js` не импортирует staging transport и не меняет своё сохранение.

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
- `V4_CONFIG.supabaseUrl` указывает на production;
- route: `production_locked`;
- `enabled=false`;
- `browserDirectWrite=false`;
- production server action и production Edge не включены.

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

Авторизация Edge выполняется по активному профилю и allowlist ролей. GitHub source и staging Edge v3 синхронизированы с `calculations.write`.

## Superseded v2

Staging deployment v2 был создан после синхронизации permission label, но при ручной упаковке deploy payload в bundle попала опечатка `normalizeRole(value)` вместо `normalizeRole(role)`.

Post-deploy проверка обнаружила дефект немедленно. v2 сразу заменён v3.

v2:

- не подключался к browser UI;
- не использовался authenticated пользователем;
- не имеет Edge logs за доступный период;
- не создал profiles, calculations, items или receipts;
- не является допустимой rollback-версией.

## Source wiring

Редактор новой версии использует `calculationVersionPersistenceRoute(V4_CONFIG.supabaseUrl)`.

Маршруты:

- `staging_edge` — только exact hostname `otulfnouybahfnsycxqn.supabase.co`;
- `production_locked` — production URL и любой другой URL.

Source wiring fail closed:

- staging ref не хранится в редакторе;
- production config не меняется;
- production route не получает сессию и не вызывает `functions.invoke`;
- production route не выполняет `.insert`, `.update`, `.delete` или `.upsert`;
- staging branch не содержит table write, browser RPC или compensating delete;
- ошибка Edge не может переключить приложение на иной write transport;
- кнопка production имеет `aria-disabled=true` и текст `Новая версия — недоступно`.

Runtime activation staging UI всё ещё требует authenticated E2E и отдельного staging config/session.

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

- ID исходной строки;
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

Все итоги, номер и автоматический заголовок версии вычисляются сервером.

## Browser flow staging

1. Редактор подтверждает exact staging hostname.
2. Проверяется UI permission `calculations.write`.
3. Берётся source calculation с `id` и `updated_at`.
4. При открытии черновика создаётся стабильный idempotency key.
5. Из строк редактора строится минимальная transport projection.
6. Автоматический title передаётся как `null`, пользовательский — явно.
7. Получается текущая JWT-сессия через `client.auth.getSession()`.
8. Вызывается только `client.functions.invoke('leader-crm-calculations', { body: command })`.
9. При HTTP 201 показывается новая тестовая версия.
10. При HTTP 200 и `idempotent_replay=true` показывается безопасный повтор без дубликата.
11. При успехе список расчётов перечитывается через read callback.
12. При ошибке черновик и idempotency key остаются для безопасного повтора.

Transport не использует:

- `.from(...)`;
- browser INSERT/UPDATE/DELETE/UPSERT;
- browser RPC;
- service role;
- compensating DELETE.

## Browser flow production

1. Route возвращает `production_locked`.
2. Сохранённые версии показывают кнопку `Новая версия — недоступно`.
3. Нажатие выводит понятную причину блокировки.
4. Исходные строки не загружаются для редактирования.
5. Табличные write-запросы и Edge-вызов не выполняются.
6. Действие `Новый пустой расчёт` остаётся доступным в существующем едином конструкторе.

## Ожидаемые staging результаты

- `HTTP 201` — новая версия создана;
- `HTTP 200` — exact replay;
- `HTTP 400` — invalid payload/items/totals;
- `HTTP 401` — JWT отсутствует или недействителен;
- `HTTP 403` — inactive profile или запрещённая роль;
- `HTTP 404` — source calculation отсутствует;
- `HTTP 409 source_changed` — источник изменился после чтения;
- `HTTP 409 idempotency_conflict` — тот же ключ использован с другим payload;
- `HTTP 409 duplicate_version_inventory` — у заявки есть дубли номеров;
- `HTTP 409 version_conflict` — параллельная операция заняла номер;
- `HTTP 500` — безопасная общая ошибка persistence.

## Authenticated positive E2E

На момент обновления staging содержит 0 Auth users. Подключённый Supabase connector не предоставляет безопасные create/delete Auth user operations.

Нельзя:

- вставлять строку напрямую в `auth.users`;
- передавать пароль, access token или refresh token в GitHub;
- использовать production Auth user;
- считать unit-тест transport полноценным HTTP E2E.

Поэтому authenticated HTTP E2E остаётся непроверенным.

Для E2E владелец вручную создаёт временного пользователя только в staging Dashboard. Затем:

1. создать active `leader_user_profiles` row для роли manager;
2. создать synthetic lead/need/source calculation только в staging;
3. открыть CRM со staging config и войти тестовым пользователем;
4. подтвердить подпись `Тестовый staging`;
5. вызвать transport и подтвердить HTTP 201;
6. повторить exact command и подтвердить HTTP 200 + replay;
7. изменить payload с тем же key и подтвердить HTTP 409;
8. изменить role на accountant и подтвердить HTTP 403 с `permission=calculations.write`;
9. вернуть manager, сделать profile inactive и подтвердить HTTP 403;
10. проверить safe response Network payload;
11. проверить Edge logs и receipt correlation;
12. удалить fixtures, profile, sessions и временного Auth user;
13. подтвердить нулевые staging counters.

## Production boundary

До отдельного решения владельца запрещены:

- замена `production_locked` на Edge route;
- production migration/RPC/index;
- production Edge deployment;
- исправление исторического дубля production;
- автоматическое удаление или перенумерование расчётов.

Browser INSERT/DELETE и compensating rollback уже удалены из редактора версий. Их нельзя возвращать как временный fallback.

Следующий gate — создать временного synthetic Auth user только в staging, выполнить authenticated browser E2E через source-wired editor, затем очистить все fixtures.