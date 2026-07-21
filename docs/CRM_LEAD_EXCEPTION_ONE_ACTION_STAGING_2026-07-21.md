# CRM: staging-проверка «Ситуация изменилась» одним действием

Дата: 21 июля 2026 года.

Связано с #396.

## Контур

- production Supabase: `ofewxuqfjhamgerwzull` — только read-only сверка структуры;
- staging Supabase: `otulfnouybahfnsycxqn` — синтетический изолированный тест;
- персональные данные и реальные заявки не использовались.

## Обнаруженный drift

Staging создавался как выборочный стенд, а не полная копия production. До проверки в нём:

- `leader_leads` содержала только `id`, `status`, `created_at`, `updated_at`;
- отсутствовало поле `next_contact_at`;
- отсутствовала таблица `leader_lead_events`;
- отсутствовали Auth users, профили и заявки.

Production уже содержит полную структуру, поэтому production migration не требуется и не создавалась.

## Staging-only установка

В staging применена миграция `staging_lead_exception_core_20260721`.

Её исходник хранится отдельно:

`supabase/staging/20260721051000_staging_lead_exception_core.sql`

Файл намеренно не находится в `supabase/migrations`, чтобы его нельзя было случайно включить в production deploy.

Контур:

- добавляет `leader_leads.next_contact_at`;
- создаёт минимальную `leader_lead_events`;
- создаёт индекс `(lead_id, created_at desc)`;
- включает RLS;
- отзывает доступ у `public`, `anon`, `authenticated`;
- разрешает DML только `service_role`.

## Синтетический сценарий

В staging внутри одной проверки:

1. создана обезличенная заявка с фиксированным тестовым UUID;
2. статус изменён с `КП отправлено` на `Нужно пересчитать`;
3. назначен следующий контакт;
4. добавлена запись истории `Проблема`;
5. точный поиск события за последние 15 минут вернул одну запись;
6. тестовая заявка удалена;
7. связанное событие удалилось каскадно.

После теста синтетические строки отсутствуют.

## Проверка доступа

Подтверждено:

- RLS включён;
- `anon` не имеет `SELECT`;
- `authenticated` не имеет `SELECT`;
- `service_role` имеет только необходимый табличный доступ;
- новые публичные политики и функции не создавались.

Security Advisor показывает информационное предупреждение `rls_enabled_no_policy`. Для этого стенда оно ожидаемо: таблицы закрыты grants и предназначены только для service-role синтетических тестов.

## Production boundary

Не выполнялись:

- DDL или DML в production;
- production migration;
- изменение RLS, grants, Auth, Storage, secrets или Edge Functions production;
- перенос тестовых данных в production;
- создание реальных пользователей или заявок в staging.
