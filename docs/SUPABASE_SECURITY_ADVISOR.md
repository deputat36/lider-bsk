# Supabase Security Advisor: РА «Лидер»

Дата: 2026-06-22.

## Контур

Проект Supabase:

`ofewxuqfjhamgerwzull`

Для РА «Лидер» анализируются только объекты `leader_*`. Объекты `nav_*` относятся к другому проектному контуру и не должны изменяться в задачах РА «Лидер» без отдельного подтверждения.

## Что уже закрыто

Прямой клиентский RPC-доступ закрыт для legacy/служебных функций:

- `leader_log(text, text, text, jsonb)`;
- `leader_get_leads_for_crm()`;
- `leader_create_order_rpc(jsonb)`.

Для этих функций отозван `EXECUTE` у:

- `public`;
- `anon`;
- `authenticated`.

`service_role` сохранён для служебных сценариев.

Миграции:

- `supabase/migrations/20260622_revoke_authenticated_execute_leader_log.sql`;
- `supabase/migrations/20260622_revoke_authenticated_execute_legacy_leads_rpc.sql`;
- `supabase/migrations/20260622_revoke_authenticated_execute_legacy_order_rpc.sql`.

Проверенный актуальный путь создания заказа:

`CRM → leader-crm-leads → create_order_from_offer`

Прямой клиентский вызов `leader_create_order_rpc(jsonb)` больше не используется.

## Что усилено без отзыва EXECUTE

Функция `leader_ensure_profile(user_email text)` нужна входу CRM v4, поэтому `EXECUTE` для `authenticated` пока сохранён.

При этом функция усилена миграцией:

`supabase/migrations/20260622_harden_leader_ensure_profile_email_source.sql`

Изменение:

- email профиля берётся из `auth.email()` текущей сессии;
- переданный клиентом `user_email` допускается только если совпадает с `auth.email()`;
- несовпадающий email отклоняется ошибкой;
- `anon` по-прежнему не может выполнять функцию.

## Что осталось в Advisor по leader_*

Supabase Security Advisor ещё показывает предупреждение `authenticated_security_definer_function_executable` для:

- `leader_ensure_profile(user_email text)`;
- `leader_has_access()`;
- `leader_is_admin()`.

Эти функции пока не закрыты автоматически.

Причины:

- `leader_has_access()` используется в RLS-политиках рабочих таблиц;
- `leader_is_admin()` используется в RLS-политиках административных таблиц;
- `leader_ensure_profile(user_email text)` используется входом CRM v4 для подготовки профиля пользователя.

Прямой отзыв `EXECUTE` у `authenticated` для этих функций может сломать вход CRM или RLS-доступ к рабочим таблицам.

## Текущая проверка

Проверка live DB показала:

- `leader_ensure_profile` доступна `authenticated`, не доступна `anon`, использует `auth.email()` и отклоняет несовпадающий email;
- `leader_has_access` доступна `authenticated`, не доступна `anon`, имеет RLS-зависимости;
- `leader_is_admin` доступна `authenticated`, не доступна `anon`, имеет RLS-зависимости;
- закрытые legacy-функции не доступны `authenticated` и `anon`.

## Дальнейшее безопасное решение

Чтобы убрать оставшиеся Advisor-предупреждения без поломки CRM, нужен отдельный рефакторинг:

1. Перенести helper-функции доступа из exposed-схемы `public` в приватную схему или заменить RLS-политики на безопасные inline-проверки.
2. Проверить все RLS-политики, которые зависят от `leader_has_access()` и `leader_is_admin()`.
3. Перепроверить вход CRM v4 без прямого вызова `leader_ensure_profile()` или заменить его серверным действием с JWT.
4. Только после этого отзывать `EXECUTE` у `authenticated` для оставшихся функций.

До такого рефакторинга эти предупреждения считаются известным остаточным риском, а не задачей для автоматического массового отзыва прав.
