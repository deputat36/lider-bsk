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

## Что вынесено из public

RLS-helper функции перенесены из exposed-схемы `public` в приватную схему `leader_private`:

- `leader_private.leader_has_access()`;
- `leader_private.leader_is_admin()`.

Миграция:

`supabase/migrations/20260622_move_leader_access_helpers_to_private_schema.sql`

Что важно:

- RLS-политики автоматически продолжают ссылаться на те же функции по зависимостям, теперь как `leader_private.*`;
- `authenticated` сохранил `EXECUTE`, чтобы RLS-проверки работали;
- `anon` не имеет `EXECUTE`;
- функций `public.leader_has_access()` и `public.leader_is_admin()` больше нет, поэтому они не должны быть доступны как public REST RPC.

Проверка RLS smoke-test под ролью `authenticated` прошла на чтении `leader_leads`.

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

- `leader_ensure_profile(user_email text)`.

Причина:

- `leader_ensure_profile(user_email text)` используется входом CRM v4 для подготовки профиля пользователя.

Прямой отзыв `EXECUTE` у `authenticated` для этой функции может сломать вход CRM.

## Текущая проверка

Проверка live DB показала:

- `leader_ensure_profile` доступна `authenticated`, не доступна `anon`, использует `auth.email()` и отклоняет несовпадающий email;
- `leader_private.leader_has_access()` доступна `authenticated`, не доступна `anon`, имеет RLS-зависимости;
- `leader_private.leader_is_admin()` доступна `authenticated`, не доступна `anon`, имеет RLS-зависимости;
- `public.leader_has_access()` и `public.leader_is_admin()` отсутствуют;
- закрытые legacy-функции не доступны `authenticated` и `anon`.

## Дальнейшее безопасное решение

Чтобы убрать последнее Advisor-предупреждение без поломки CRM, нужен отдельный рефакторинг входа:

1. Перепроверить вход CRM v4 без прямого вызова `leader_ensure_profile()` или заменить его серверным действием с JWT.
2. Перенести подготовку профиля в Edge Function или другой закрытый серверный контур.
3. Только после этого отзывать `EXECUTE` у `authenticated` для `leader_ensure_profile(user_email text)`.

До такого рефакторинга это предупреждение считается известным остаточным риском, а не задачей для автоматического массового отзыва прав.
