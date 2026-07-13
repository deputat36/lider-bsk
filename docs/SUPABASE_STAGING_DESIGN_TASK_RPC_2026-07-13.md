# Supabase staging для design task RPC — 2026-07-13

## Окружения

- Production: `ofewxuqfjhamgerwzull` — рабочий проект РА «Лидер».
- Staging: `otulfnouybahfnsycxqn` — `lider-bsk-staging`.
- Организация: `Lider` / `tcbupmmcojrcxfqjuwsm`.
- Регион обоих проектов: `eu-west-1`.
- PostgreSQL: 17.

Project refs не являются секретами. Пароль базы, secret/service-role keys и JWT secrets в репозитории не хранятся.

## Почему используется отдельный staging-only путь

История production-миграций пока не нормализована относительно файлов в `supabase/migrations`. Часть существующих SQL-файлов является снимками итогового состояния, а production содержит другую последовательность 14-значных migration versions.

Поэтому до нормализации запрещено использовать обычный `supabase db push` как способ развернуть CRM с чистой базы. Для тестового контура используются отдельные каталоги:

- `supabase/staging-migrations`;
- `supabase/staging-tests`.

Они не являются автоматическим production deployment pipeline.

## Защита окружения

Первая staging-only миграция создаёт:

- `leader_staging.environment_guard`;
- точный marker project ref `otulfnouybahfnsycxqn`;
- marker окружения `staging`;
- marker репозитория `deputat36/lider-bsk`.

Каждая business migration обязана проверить guard до DDL. В staging SQL запрещён production ref `ofewxuqfjhamgerwzull`.

`supabase/config.toml` продолжает указывать на production. Его нельзя переключать на staging.

## Изолированный design-task harness

Staging создаёт только минимальные зависимости команды `design_task.create_from_order`:

- `leader_user_profiles`;
- `leader_leads`;
- `leader_orders`;
- `leader_lead_needs`;
- `leader_production_jobs`;
- `leader_design_tasks`;
- `leader_design_task_events`;
- `leader_private.leader_command_receipts`;
- partial unique index одной активной design task на заказ;
- `leader_create_design_task_from_order_rpc(jsonb)`.

Это не полная копия production CRM и не нормализованная production migration.

## Безопасность

RPC:

- `SECURITY INVOKER`;
- пустой `search_path`;
- полностью квалифицированные объекты;
- `EXECUTE` только для `service_role`;
- direct browser call запрещён;
- проверяет активный профиль;
- разрешает `design.write` только ролям owner/admin/manager/designer;
- неизвестную роль отклоняет;
- не доверяет browser-supplied status, author, owner или designer;
- вычисляет SHA-256 на сервере;
- использует transaction advisory lock;
- блокирует order/task rows;
- сохраняет receipt, design task и audit event атомарно;
- возвращает минимальную projection без контактов клиента, финансов и внутренних комментариев.

Новые public-таблицы имеют RLS. `anon` и `authenticated` не получают прямых table grants в этом harness. Private receipt storage не выставляется браузеру.

## Синтетические тесты

`supabase/staging-tests/20260713_design_task_create_from_order.sql` использует только фиктивные UUID, адреса `example.invalid` и sentinel-значения.

Проверяются:

- успешное атомарное создание;
- safe replay;
- idempotency hash conflict;
- конфликт активной design task;
- запрещённая роль и неактивный профиль;
- stale order;
- потребность без design evidence;
- потребность другой заявки;
- неправильная production relation;
- новая задача после завершённой;
- fail-closed неизвестного raw status;
- rollback при ошибке audit event;
- rollback при ошибке receipt completion;
- отсутствие изменения статуса, макета, производства, оплаты и финансов заказа;
- отсутствие утечки клиентских и финансовых sentinel-значений;
- удаление всех синтетических строк после теста.

Production data в staging не копируются.

## Последовательность проверки

1. Убедиться, что staging пустой и имеет project ref `otulfnouybahfnsycxqn`.
2. Применить environment guard только к staging.
3. Применить design-task harness только к staging.
4. Выполнить синтетический SQL-тест.
5. Проверить, что business tables снова содержат ноль строк.
6. Запустить Supabase security и performance advisors.
7. Сравнить созданные объекты с machine-readable contract.
8. Не разворачивать Edge Function до успешного завершения RPC-тестов.

## Production boundary

Без отдельного production approval запрещены:

- любые DDL/DML в `ofewxuqfjhamgerwzull`;
- применение staging SQL к production;
- перенос production data в staging;
- production RPC/Edge deploy;
- изменение production RLS, grants или policies;
- backfill двух текущих заказов, которым нужна design task.

Следующий production этап возможен только после нормализации migration history, review staging-результатов, отдельного rollback review и явного подтверждения владельца.
