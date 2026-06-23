# Supabase Security Advisor: РА «Лидер»

Дата: 2026-06-23.

## Контур

Проект Supabase:

`ofewxuqfjhamgerwzull`

Для РА «Лидер» анализируются только объекты `leader_*`. Объекты `nav_*` относятся к другому проектному контуру и не изменяются без отдельного подтверждения.

## Закрыто по leader_*

Прямой клиентский RPC-доступ закрыт для legacy/служебных функций:

- `leader_log(text, text, text, jsonb)`;
- `leader_get_leads_for_crm()`;
- `leader_create_order_rpc(jsonb)`;
- `leader_ensure_profile(user_email text)`.

Для этих функций отозван `EXECUTE` у:

- `public`;
- `anon`;
- `authenticated`.

`service_role` сохранён для служебных сценариев.

Миграции:

- `supabase/migrations/20260622_revoke_authenticated_execute_leader_log.sql`;
- `supabase/migrations/20260622_revoke_authenticated_execute_legacy_leads_rpc.sql`;
- `supabase/migrations/20260622_revoke_authenticated_execute_legacy_order_rpc.sql`;
- `supabase/migrations/20260622_revoke_authenticated_execute_leader_ensure_profile.sql`.

## Профиль CRM

Подготовка профиля CRM v4 перенесена из прямого RPC в Edge Function:

`leader-crm-leads`, action `ensure_profile`

Текущая live-версия функции:

`v8`, JWT включён.

Исходник live-функции сохранён в основном репозитории:

`supabase/functions/leader-crm-leads/index.ts`

Фронтенд больше не вызывает `supabaseClient.rpc('leader_ensure_profile', ...)` напрямую. Обновлены:

- `crm/v4/assets/v4/auth.js` в `deputat36/lider-bsk`;
- `assets/v4/auth.js` в `deputat36/lidercalculator`.

## Что вынесено из public

RLS-helper функции перенесены из exposed-схемы `public` в приватную схему `leader_private`:

- `leader_private.leader_has_access()`;
- `leader_private.leader_is_admin()`.

Миграция:

`supabase/migrations/20260622_move_leader_access_helpers_to_private_schema.sql`

RLS-политики продолжают работать через зависимости на перенесённые функции.

## Аудит публичных заявок

Таблица:

`public.leader_public_lead_audit`

Проверено и ужато 2026-06-23:

- RLS включён;
- `anon` имеет только `INSERT`;
- `authenticated` имеет только `SELECT`;
- `service_role` сохранён для служебного доступа;
- политика `leader_public_lead_audit_insert_public` разрешает публичную запись только ожидаемой формы события;
- политика `leader_public_lead_audit_select_staff` разрешает чтение только активным сотрудникам ролей `owner`, `admin`, `manager`.

Миграция:

`supabase/migrations/20260623_tighten_leader_public_lead_audit_grants.sql`

## Проверка

Проверка live DB показала:

- `leader_ensure_profile` не доступна `public`, `anon`, `authenticated`;
- `leader_ensure_profile` доступна `service_role`;
- в `public` больше нет `leader_*` `SECURITY DEFINER` функций, доступных `authenticated`;
- у `leader_public_lead_audit` минимальные табличные права: `anon INSERT`, `authenticated SELECT`;
- Supabase Security Advisor больше не показывает предупреждений по `leader_*`.

Остаточные Advisor-предупреждения относятся к:

- `nav_*` объектам другого проектного контура;
- настройке Auth leaked password protection.

Их не изменяли в рамках задач РА «Лидер».