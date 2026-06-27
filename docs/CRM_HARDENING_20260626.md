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

Live Edge Function `leader-crm-leads` активна как version 11, `verify_jwt=true`.

В version 11 действие `ensure_profile` больше не вызывает публичный RPC `leader_ensure_profile` с пользовательским JWT. Функция проверяет JWT пользователя через Supabase Auth, а профиль читает/создаёт через service role REST. Поэтому `leader_ensure_profile(text)` в live ACL закрыта от `authenticated` и доступна только `postgres`/`service_role`.

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

Активный replacement PR: #31 `CRM: access admin and Supabase SQL synced with latest main`.

PR содержит:

- вкладку `Доступ` в меню CRM;
- разрешение вкладки `user_admin` в таб-роутере;
- модуль `crm/v4/assets/v4/user-admin-v1.js`;
- обновлённый `auth.js` с pending-состоянием;
- SQL-миграции pending/invite flow;
- SQL-миграцию `leader_create_order_from_offer_rpc(jsonb)`;
- hardening execute-прав без возврата `authenticated` на `leader_ensure_profile(text)`;
- FK index migration для `leader_user_invites`;
- документацию по текущему состоянию.

Edge Function в PR синхронизирована с текущей live/main v11, чтобы PR не откатывал hardening из `main`.

## Advisors

Supabase performance advisor больше не показывает `unindexed_foreign_keys` для `leader_user_invites` после добавления FK indexes.

Security advisor больше не требует отдельного restore для `leader_ensure_profile(text)`: live ACL показывает execute только у `postgres` и `service_role`.

## Почему PR пока draft

CI должен быть зелёным на текущем head. После этого остаётся ручная проверка CRM-сценариев:

1. Вход активного пользователя.
2. Pending-доступ нового пользователя.
3. Вкладка `Доступ`.
4. Создание и закрытие приглашения.
5. Сценарий заявка → расчёт → КП `Согласовано` → заказ.
6. Повторное создание заказа из того же КП без дубля.

## Безопасное текущее состояние

Боевой Supabase-контур уже защищает новых пользователей и закрывает прямой execute опасных CRM RPC для обычных авторизованных пользователей. PR #31 не должен возвращать `authenticated` execute на `leader_ensure_profile(text)`.
