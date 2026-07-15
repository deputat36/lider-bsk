# Безопасная проекция ответа версии расчёта

Дата: 15 июля 2026 года.

Статус: source-only correction до первого применения staging migration.

## Найденный риск

Первоначальный staging-кандидат `20260715_02_calculation_version_harness.sql` формировал успешный ответ через:

- `to_jsonb(v_new_calculation)`;
- `to_jsonb(item_row)`.

Это возвращало всю физическую строку таблицы, включая поля, которые не входят в публичный серверный контракт:

- `created_by`;
- `updated_by`;
- `commercial_offer_id`;
- `order_id`;
- `calculation_id` в позициях;
- `lead_id` в позициях;
- любые будущие колонки, которые могли бы быть добавлены в таблицу позднее.

Edge Function передаёт успешный RPC-результат клиенту без дополнительной фильтрации. Поэтому whole-row projection была устранена до применения миграции и до deployment Edge Function.

## Исправление

Добавлена staging-only migration:

`supabase/staging-migrations/20260715_03_calculation_version_safe_response.sql`.

Она выполняет следующие действия:

1. Проверяет точный staging environment guard.
2. Перемещает исходную атомарную persistence-функцию из `public` в `leader_private`.
3. Переименовывает её в `leader_create_calculation_version_rpc_internal_v1`.
4. Оставляет EXECUTE внутренней функции только `service_role`.
5. Создаёт новый public wrapper с исходным RPC-именем.
6. Public wrapper вызывает private persistence-функцию.
7. Ошибочные ответы возвращаются без изменения и без деталей SQL.
8. Успешный ответ собирается только через явный список разрешённых полей.
9. Безопасный ответ заменяет response в private idempotency receipt в той же транзакции.
10. Повтор команды возвращает ту же безопасную проекцию с `idempotent_replay=true`.

## Поля расчёта в ответе

Разрешены только:

- `id`;
- `lead_id`;
- `need_id`;
- `client_id`;
- `title`;
- `status`;
- `version_number`;
- `client_total`;
- `contractor_cost`;
- `profit`;
- `margin_percent`;
- `warning_level`;
- `warnings`;
- `public_comment`;
- `internal_comment`;
- `created_at`;
- `updated_at`.

Не возвращаются:

- `created_by`;
- `updated_by`;
- `commercial_offer_id`;
- `order_id`.

## Поля позиции в ответе

Разрешены только:

- `id`;
- `catalog_id`;
- `category`;
- `item_type`;
- `name`;
- `unit`;
- `qty`;
- `contractor_price`;
- `contractor_sum`;
- `markup_percent`;
- `client_price`;
- `client_sum`;
- `profit`;
- `margin_percent`;
- `comment`;
- `data`;
- `sort_order`;
- `created_at`;
- `updated_at`.

Не возвращаются:

- `calculation_id`;
- `lead_id`.

## Почему private implementation остаётся SECURITY INVOKER

Внутренняя и публичная функции используют `SECURITY INVOKER` и пустой `search_path`.

Вызов выполняется только `service_role` из JWT-защищённой Edge Function. Это сохраняет минимальные grants и не добавляет `SECURITY DEFINER`, который мог бы обходить RLS или скрывать ошибку авторизации.

## Acceptance

Добавлен транзакционный тест:

`supabase/staging-tests/20260715_calculation_version_safe_response.sql`.

Он проверяет:

- полный allowlist ключей расчёта;
- полный allowlist ключей позиции;
- отсутствие server-owned полей;
- отсутствие parent identifiers позиции;
- сохранение безопасного ответа в receipt;
- идентичную safe projection при replay;
- отсутствие EXECUTE у `anon` и `authenticated`;
- наличие EXECUTE у `service_role`;
- итоговый `ROLLBACK` тестовых данных.

## Порядок staging rollout

До Edge deployment обязательно применяются последовательно:

1. `20260715_02_calculation_version_harness.sql`;
2. `20260715_03_calculation_version_safe_response.sql`;
3. `20260715_calculation_version_acceptance.sql`;
4. `20260715_calculation_version_safe_response.sql`;
5. security и performance advisors;
6. только после этого — deployment `leader-crm-calculations`.

Между шагами 1 и 2 Edge Function не должна быть развёрнута.

## Supabase

На момент подготовки исправления:

- migration 02 ещё не применялась;
- migration 03 ещё не применялась;
- таблицы расчётов в staging отсутствуют;
- `leader-crm-calculations` в staging отсутствует;
- production не изменялся.

## Границы

Не изменяются:

- production Supabase;
- Auth;
- работающие RLS policies;
- существующие production Edge Functions;
- `nav_*`, `parket_*`, `broker_*`.