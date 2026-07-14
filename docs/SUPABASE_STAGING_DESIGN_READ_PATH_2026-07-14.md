# Staging browser read-path дизайн-задачи — 2026-07-14

## Окружения

- staging: `otulfnouybahfnsycxqn`;
- production: `ofewxuqfjhamgerwzull`;
- репозиторий: `deputat36/lider-bsk`;
- стандартный `supabase/config.toml` продолжает указывать на production;
- изменения применены только к отдельному бесплатному staging-проекту.

Production schema, RLS, grants, Auth, Edge Functions и данные в этом этапе не изменялись.

## Цель

Существующий preview дизайн-задачи читает минимальные данные напрямую через текущий браузерный `supabaseClient`:

- `leader_orders`;
- `leader_lead_needs`;
- `leader_design_tasks`.

До этого этапа RLS на таблицах была включена, но browser policies и `authenticated SELECT` отсутствовали. Поэтому staging preview и read-after-success не могли работать под реальной пользовательской сессией.

## Авторизация

Добавлен staging-only helper:

`leader_private.leader_has_crm_action(text)`

Свойства:

- принимает только action name;
- не принимает browser-supplied user id;
- получает пользователя только через `auth.uid()`;
- требует активную строку в `public.leader_user_profiles`;
- поддерживает только `design.read`;
- неизвестный action возвращает `false`;
- неизвестная роль и неактивный профиль fail closed;
- `SECURITY DEFINER` расположен в private schema;
- `search_path` пустой;
- все объекты в функции полностью квалифицированы;
- функция возвращает только boolean;
- `anon` не имеет `USAGE` schema и `EXECUTE` функции;
- `authenticated` получает только `USAGE` private schema и `EXECUTE` boolean helper;
- private schema не является exposed Data API schema;
- `leader_private.leader_command_receipts` не получает browser grants.

Разрешённые роли синхронизированы с `action-permissions-v1.js`:

- owner;
- admin;
- manager;
- designer.

Запрещены:

- accountant;
- installer;
- contractor;
- неактивный manager;
- неизвестная роль;
- запрос без действующего `auth.uid()`.

## Column-level SELECT

Table-level SELECT для `authenticated` не выдаётся. Разрешены только конкретные колонки, которые уже используются `design-task-draft-preview-v1.js`.

### leader_orders

Разрешены:

- `id`;
- `order_number`;
- `lead_id`;
- `project_name`;
- `status`;
- `priority`;
- `deadline`;
- `layout_status`;
- `layout_link`;
- `is_archived`;
- `updated_at`.

Не выдаются контакты клиента, финансовые поля, production status, внутренний комментарий, owner и JSON data.

### leader_lead_needs

Разрешены:

- `id`;
- `lead_id`;
- `need_type`;
- `title`;
- `need_design`;
- `design_reason`;
- `deadline_date`;
- `status`;
- `completeness_score`;
- `created_at` для безопасной сортировки.

Не выдаются `description`, `structured_data`, `missing_fields`, author и updater.

### leader_design_tasks

Разрешены:

- `id`;
- `order_id`;
- `task_status`;
- `layout_status`;
- `designer_name`;
- `deadline`;
- `layout_link`;
- `created_at`.

Не выдаются клиентские контакты, ТЗ, source, reference link, comments, owner и author fields.

## RLS

Созданы три SELECT policy для `authenticated`:

- `leader_orders_design_read_staging`;
- `leader_lead_needs_design_read_staging`;
- `leader_design_tasks_design_read_staging`.

Каждая policy вызывает:

`leader_private.leader_has_crm_action('design.read')`

Browser INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES и TRIGGER privileges отсутствуют. Write policies не создавались.

Прямой `EXECUTE` функции `leader_create_design_task_from_order_rpc(jsonb)` для `PUBLIC`, `anon` и `authenticated` остаётся отозванным. RPC доступна только `service_role` через JWT-защищённую Edge Function.

## Фактическая staging-проверка

Проверка выполнена только на staging с синтетическими UUID и `example.invalid`.

Подтверждено:

- helper — `SECURITY DEFINER` с `search_path=""`;
- `authenticated` имеет helper EXECUTE, `anon` не имеет;
- `authenticated` не имеет receipt SELECT;
- table-level SELECT на трёх таблицах отсутствует;
- safe column privileges присутствуют;
- client/finance/internal column privileges отсутствуют;
- INSERT, UPDATE и DELETE отсутствуют;
- direct design RPC EXECUTE отсутствует;
- присутствуют ровно три SELECT policy;
- owner/admin/manager/designer видят по одной синтетической строке каждой таблицы;
- accountant/installer/contractor/inactive manager/unknown role видят 0 строк;
- запрос без `auth.uid()` видит 0 строк;
- `anon` получает privilege denial;
- реальные safe projections preview выполняются;
- попытки прочитать private columns отклоняются;
- попытки browser INSERT, UPDATE, DELETE, receipt SELECT и direct RPC отклоняются.

## Очистка

Для live-проверки временно создавались только синтетические staging-строки:

- 9 профилей;
- 1 lead;
- 1 order;
- 1 need;
- 1 design task.

Auth users не создавались.

После проверки все synthetic rows удалены. Финальные счётчики:

- environment guard — 1;
- profiles — 0;
- orders — 0;
- needs — 0;
- design tasks — 0;
- design events — 0;
- receipts — 0.

Source SQL integration test использует транзакцию и заканчивается `ROLLBACK`.

## Advisors

После DDL запущены Supabase advisors.

Security:

- WARN/ERROR по staging `leader_*` — 0;
- остаются только ожидаемые INFO для private/service-only таблиц без browser policies.

Performance:

- WARN/ERROR по staging `leader_*` — 0;
- остаётся INFO о пока не использованном индексе на пустой staging-таблице.

## Что не доказано

Реальный authenticated HTTP/browser E2E всё ещё не выполнен, потому что подключённый Supabase connector не предоставляет безопасный lifecycle создания и удаления Auth user.

SQL role simulation доказывает ACL и RLS, но не заменяет:

- вход отдельного staging Auth user;
- HTTP 201 create;
- HTTP 200 exact replay;
- HTTP 409 modified-payload conflict;
- HTTP 403 forbidden/inactive profile;
- реальный post-create read-after-success через браузерную сессию;
- Network evidence.

Нельзя объявлять эти сценарии пройденными до создания отдельного тестового пользователя через Dashboard/Admin API и полной очистки.

## Production boundary

Запрещено переносить эту staging migration в production без отдельного явного решения владельца. Production rollout должен отдельно рассмотреть:

- существующие production RLS и grants;
- совместимость helper с общей серверной RBAC-моделью;
- production migration и rollback;
- реальный Auth E2E;
- включение рабочей кнопки;
- backfill текущих заказов.
