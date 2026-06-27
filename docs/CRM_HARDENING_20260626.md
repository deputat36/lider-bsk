# CRM hardening — статус на 2026-06-26

Контур: CRM РА «Лидер», Supabase project `ofewxuqfjhamgerwzull`.

## Что применено в Supabase

### Pending-доступ новых пользователей

В базе создана модель приглашений:

- `leader_user_invites`;
- admin policies для owner/admin;
- trigger нормализации email;
- trigger активации профиля по действующему приглашению;
- обновлённая логика `leader_ensure_profile(text)`.

Новый пользователь без активного invite получает inactive/pending профиль. Пользователь с действующим invite активируется автоматически при создании профиля.

### Edge Function bootstrap

Live Edge Function `leader-crm-leads` активна как version 12, `verify_jwt=true`.

В version 12 действие `ensure_profile` больше не вызывает публичный RPC `leader_ensure_profile` с пользовательским JWT. Функция проверяет JWT пользователя через Supabase Auth, а профиль читает/создаёт через service role REST. Поэтому `leader_ensure_profile(text)` в live ACL закрыта от `authenticated` и доступна только `postgres`/`service_role`.

`create_order_from_offer` в version 12 не выполняет старую multi-request конвертацию в Edge Function. Он передаёт payload в `leader_create_order_from_offer_rpc(jsonb)`, а атомарность обеспечивает Postgres RPC.

### Атомарное создание заказа из КП

В базе создана RPC:

`leader_create_order_from_offer_rpc(jsonb)`

Назначение:

- принять `offer_id` согласованного КП;
- заблокировать КП, расчёт и заявку на время операции;
- проверить статус `Согласовано`;
- вернуть уже созданный заказ без дубля;
- создать или найти клиента;
- создать заказ;
- перенести позиции расчёта в позиции заказа;
- связать КП, расчёт и заявку с заказом;
- записать событие КП и историю статуса заказа.

Прямой execute `leader_create_order_from_offer_rpc(jsonb)` закрыт для `anon`, `authenticated`, `public`. В live базе execute остался только у `postgres` и `service_role`.

## Что есть в GitHub

Replacement PR #31 merged в `main`.

`main` содержит:

- вкладку `Доступ` в меню CRM;
- разрешение вкладки `user_admin` в таб-роутере;
- модуль `crm/v4/assets/v4/user-admin-v1.js`;
- обновлённый `auth.js` с pending-состоянием;
- SQL-миграции pending/invite flow;
- SQL-миграцию `leader_create_order_from_offer_rpc(jsonb)`;
- hardening execute-прав без возврата `authenticated` на `leader_ensure_profile(text)`;
- FK index migration для `leader_user_invites`;
- restrict grants migration для `leader_user_invites`;
- safe pending self-insert policy для `leader_user_profiles`;
- документацию по текущему состоянию.

Edge Function в GitHub синхронизирована с текущей live version 12, чтобы `main` не откатывал hardening из Supabase.

## Advisors

Supabase performance advisor больше не показывает `unindexed_foreign_keys` для `leader_user_invites` после добавления FK indexes.

Security advisor по-прежнему показывает общий baseline по `nav_*` SECURITY DEFINER RPC и leaked password protection. Узкая проверка CRM показывает: среди `public.leader_%` SECURITY DEFINER функций нет функций, доступных `anon`, `authenticated` или `public`.

## Migration history note

Часть CRM SQL sync-файлов в GitHub имеет manual snapshot-имена вида `20260626_01...`, а production Supabase migration history использует 14-значные versions. Это не runtime-блокер для текущей CRM: live DB проверена через SQL-интроспекцию и соответствует ожидаемому hardening-состоянию.

Если дальше использовать `supabase db push` или preview branches как основной путь деплоя БД, нужно отдельно привести локальную migration history к production history, чтобы не получить drift между GitHub и `supabase_migrations.schema_migrations`.

## Что осталось проверить вручную

1. Вход активного пользователя.
2. Pending-доступ нового пользователя.
3. Вкладка `Доступ`.
4. Создание и закрытие приглашения.
5. Сценарий заявка → расчёт → КП `Согласовано` → заказ.
6. Повторное создание заказа из того же КП без дубля.

## Безопасное текущее состояние

Боевой Supabase-контур уже защищает новых пользователей и закрывает прямой execute опасных CRM RPC для обычных авторизованных пользователей. `main` не должен возвращать `authenticated` execute на `leader_ensure_profile(text)` или `leader_create_order_from_offer_rpc(jsonb)`.
