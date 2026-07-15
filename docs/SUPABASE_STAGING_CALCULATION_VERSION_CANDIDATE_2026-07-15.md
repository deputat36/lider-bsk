# Staging-кандидат создания версии расчёта

Дата: 15 июля 2026 года.

Статус: source-only. В Supabase не применён и не развёрнут.

## Контуры

Production:

- project ref: `ofewxuqfjhamgerwzull`;
- используется только для чтения структуры и аудита;
- любые DDL, DML, RLS, grants, Edge deployment и исправление исторических данных требуют отдельного разрешения.

Staging:

- project ref: `otulfnouybahfnsycxqn`;
- отдельный бесплатный проект `lider-bsk-staging`;
- предназначен для изолированной проверки schema/RPC/Edge;
- production-данные в staging не копируются.

Стандартный `supabase/config.toml` остаётся привязан к production. Staging-кандидат защищён точным environment guard и дополнительной проверкой project ref внутри Edge Function.

## Подтверждённая production-проблема

Read-only аудит выявил:

- 11 сохранённых расчётов;
- 30 сохранённых строк;
- 8 расчётов связаны с КП;
- 5 расчётов связаны с заказами;
- у одной заявки две записи имеют номер версии 1.

Поэтому уникальный индекс нельзя переносить в production до отдельного аудита и согласованного исправления исторического дубля.

## Source-only файлы

Миграция-кандидат:

`supabase/staging-migrations/20260715_02_calculation_version_harness.sql`

Edge Function-кандидат:

- `supabase/functions/leader-crm-calculations/index.ts`;
- `supabase/functions/leader-crm-calculations/contract.ts`;
- `supabase/functions/leader-crm-calculations/contract_test.ts`.

Acceptance-скрипт:

`supabase/staging-tests/20260715_calculation_version_acceptance.sql`

Команда:

`calculation.create_version`.

RPC:

`public.leader_create_calculation_version_rpc(p_payload jsonb)`.

## Объекты, которые создаст staging migration

Только после отдельного разрешения миграция создаст или проверит:

1. `public.leader_lead_calculations` — staging-копию структуры production-расчёта.
2. `public.leader_lead_calculation_items` — staging-копию структуры строк.
3. `leader_lead_calculations_lead_version_uidx` — уникальность `(lead_id, version_number)` в чистом staging.
4. `leader_lead_calculations_lead_created_idx` — загрузка версий заявки.
5. `leader_lead_calculation_items_calculation_sort_idx` — загрузка строк расчёта.
6. `public.leader_create_calculation_version_rpc(jsonb)` — атомарную команду создания версии.

Миграция зависит от ранее созданного staging harness:

- `leader_staging.environment_guard`;
- `public.leader_user_profiles`;
- `public.leader_leads`;
- `public.leader_lead_needs`;
- `leader_private.leader_command_receipts`.

При отсутствии guard или зависимостей миграция завершается до business DDL.

## Модель доступа

Browser не вызывает RPC напрямую и не получает service role.

Edge Function:

- требует `verify_jwt=true`;
- проверяет JWT через `/auth/v1/user`;
- загружает только активный профиль;
- допускает роли `owner`, `admin`, `manager`;
- сообщает каноническое разрешение `calculation.write`;
- игнорирует любые actor-поля клиента;
- жёстко проверяет staging project ref;
- вызывает только RPC;
- не выполняет прямые POST/PATCH/DELETE таблиц.

На таблицы расчётов:

- отозваны права `public`, `anon`, `authenticated`;
- `service_role` получает только `SELECT, INSERT`;
- DELETE и UPDATE не выдаются;
- RLS включён как дополнительная защита.

RPC execute разрешён только `service_role`.

## Входной контракт

Обязательны:

- `action`;
- `request_id` UUID;
- `expected_updated_at`;
- `source_calculation_id`;
- `idempotency_key`;
- от 1 до 200 строк.

Browser может передать в строке:

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

Browser не может передать:

- calculation/lead/actor IDs;
- status;
- version number;
- КП или order link;
- суммы;
- прибыль;
- наценку;
- маржу;
- warning level.

## Атомарность и конкуренция

RPC выполняет одну транзакцию:

1. Проверяет активного actor и роль.
2. Канонизирует payload и вычисляет SHA-256.
3. Берёт advisory lock по action + idempotency key.
4. Проверяет `leader_command_receipts`.
5. Блокирует source calculation через `FOR UPDATE`.
6. Берёт advisory lock по action + lead ID.
7. Проверяет `expected_updated_at`.
8. Блокирует rollout при исторических дублях номера версии.
9. Проверяет принадлежность need той же заявке.
10. Серверно пересчитывает каждую строку и общие итоги.
11. Назначает `max(version_number) + 1`.
12. Создаёт receipt со статусом `in_progress`.
13. Создаёт расчёт со статусом `Черновик` и пустыми ссылками КП/заказа.
14. Создаёт snapshot строк.
15. Завершает receipt и возвращает результат.

При любой ошибке расчёт, строки и receipt откатываются вместе. Клиентский compensating DELETE не используется.

## Неизменность источника

RPC не выполняет UPDATE или DELETE исходного расчёта и его строк.

Существующие:

- `commercial_offer_id`;
- `order_id`;
- status;
- totals;
- comments;
- item snapshot

остаются у исходной версии. Новая версия не наследует связи с КП и заказом.

## Acceptance-сценарии

Транзакционный staging-скрипт проверяет:

- создание версии 2 из версии 1;
- server-side totals;
- статус `Черновик`;
- отсутствие КП/order link у новой версии;
- полную неизменность source row;
- одинаковый idempotency key + payload возвращает тот же результат;
- одинаковый key + другой payload возвращает `idempotency_conflict`;
- отрицательная прибыль возвращает `invalid_totals`;
- неуспешные команды не создают лишние версии;
- success receipt существует;
- итоговый `ROLLBACK` удаляет тестовые данные.

Отдельно после применения нужно проверить двумя параллельными клиентами:

- два разных idempotency key для одного lead;
- один и тот же key одновременно;
- source change между чтением и командой;
- forced failure при вставке второй строки;
- forced failure перед завершением receipt;
- security и performance advisors.

## Approval gates

До первого staging write требуется явное разрешение на:

1. применение `20260715_02_calculation_version_harness.sql`;
2. запуск acceptance SQL;
3. deployment `leader-crm-calculations` в staging.

После успешного staging отдельно согласуются:

1. production remediation исторического дубля;
2. production unique index;
3. production RPC migration;
4. production Edge deployment;
5. подключение browser action.

Ни один из этих шагов текущий PR не выполняет.

## Rollback

Staging rollback — app-first:

1. Не подключать или отключить Edge action.
2. Остановить новые команды.
3. Сохранить receipts и созданные версии как доказательство.
4. Не удалять и не перенумеровывать записи автоматически.
5. Схемный rollback выполнять только отдельной согласованной миграцией.

## Границы PR

Не изменяются:

- production и staging Supabase;
- production данные;
- Auth;
- RLS policies;
- grants в работающих проектах;
- существующие Edge Functions;
- `nav_*`, `parket_*`, `broker_*`.