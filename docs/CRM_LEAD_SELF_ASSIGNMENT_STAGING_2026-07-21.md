# Staging-проверка самоназначения заявки

Дата: 21 июля 2026 года.

Связано с issue #398 и #205.

## Контур

- Production Supabase: `ofewxuqfjhamgerwzull` — использовался только для агрегатных read-only запросов.
- Staging Supabase: `otulfnouybahfnsycxqn`.
- Миграция staging: `staging_lead_assignment_core_20260721`.
- SQL хранится только в `supabase/staging/20260721054500_staging_lead_assignment_core.sql`.
- Production migration для этого изменения не требуется: поле `leader_leads.assigned_to` в production уже существует.

## Безопасность staging

В выборочный staging-контур добавлено только поле `leader_leads.assigned_to` для синтетической проверки.

Подтверждено:

- RLS на `leader_leads` включён;
- `anon` не имеет доступа к полю ответственности;
- `authenticated` не имеет доступа к полю ответственности;
- доступ для проверки есть только у `service_role`;
- пользователи, клиенты, телефоны и другие персональные данные не создавались.

## Синтетический сценарий

Использована временная заявка:

- lead id: `11111111-1111-4111-8111-111111111111`;
- исходный статус: `Новая`;
- исходный `assigned_to`: `null`.

Первый условный запрос:

- назначил синтетического сотрудника `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
- изменил статус на `В работе`;
- условие `assigned_to IS NULL` выполнилось;
- запрос вернул обновлённую строку.

Второй конкурентный запрос из условно устаревшей вкладки:

- пытался назначить `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
- использовал то же условие `assigned_to IS NULL`;
- вернул ноль строк;
- не изменил ответственного первого сотрудника.

Контрольный SELECT подтвердил:

- `assigned_to` остался равен первому синтетическому сотруднику;
- статус остался `В работе`;
- `first_assignment_preserved = true`.

## Очистка

Синтетическая заявка удалена сразу после проверки.

Финальная проверка показала:

- `synthetic_rows = 0`;
- `anon_can_read_assignment = false`;
- `authenticated_can_read_assignment = false`;
- `service_role_can_read_assignment = true`.

## Вывод

Compare-and-set условие защищает заявку от перехвата вторым сотрудником даже при устаревшей вкладке браузера. Для production не выполнялись DDL, DML, backfill, изменение Auth, RLS, grants, Storage, secrets или Edge Functions.
