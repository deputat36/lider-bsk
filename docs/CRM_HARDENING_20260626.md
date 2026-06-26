# CRM hardening — статус на 2026-06-26

Контур: CRM РА «Лидер», Supabase project `ofewxuqfjhamgerwzull`.

## Что применено в Supabase

### Pending-доступ новых пользователей

В базе создана модель приглашений:

- `leader_user_invites`;
- trigger активации профиля по приглашению;
- обновлённая логика `leader_ensure_profile(text)`;
- новые пользователи без приглашения получают неактивный профиль и ждут подтверждения владельцем или администратором.

Проверено в живой базе:

- `leader_user_invites` существует;
- RLS включён;
- policies `leader_user_invites_admin_select`, `leader_user_invites_admin_insert`, `leader_user_invites_admin_update` установлены для роли `authenticated` через admin-предикат;
- trigger `leader_user_invites_normalize_trg` установлен на insert/update;
- trigger `leader_apply_profile_invite_trg` установлен на insert в `leader_user_profiles`;
- `leader_ensure_profile(text)` доступна роли `authenticated`, потому что Edge Function вызывает её с пользовательским JWT;
- FK indexes `leader_user_invites_invited_by_idx` и `leader_user_invites_accepted_user_id_idx` созданы.

### Атомарное создание заказа из КП

В базе создана RPC:

`leader_create_order_from_offer_rpc(jsonb)`

Назначение:

- принять `offer_id` согласованного КП;
- заблокировать КП, расчёт и заявку на время операции;
- проверить статус `Согласовано`;
- вернуть уже созданный заказ, если он уже связан с КП/расчётом/заявкой;
- создать или найти клиента;
- создать заказ;
- перенести позиции расчёта в позиции заказа;
- связать КП, расчёт и заявку с заказом;
- записать событие КП и историю статуса заказа.

Edge Function `leader-crm-leads` задеплоена в Supabase как version 10, `verify_jwt=true`, `ACTIVE`. Действие `create_order_from_offer` вызывает эту RPC через `service_role`.

После security hardening прямой execute `leader_create_order_from_offer_rpc(jsonb)` закрыт для `anon`, `authenticated`, `public`. В живой базе execute остался только у `postgres` и `service_role`.

## Что есть в GitHub

Активный PR: #24 `CRM: access admin and Supabase SQL synced with main`.

PR содержит:

- вкладку `Доступ` в меню CRM;
- разрешение вкладки `user_admin` в таб-роутере;
- модуль `crm/v4/assets/v4/user-admin-v1.js`;
- обновлённый `auth.js` с pending-состоянием;
- Edge Function `supabase/functions/leader-crm-leads/index.ts`, соответствующую deployed version 10;
- исполняемые SQL-миграции `20260626_01`–`20260626_10`;
- hardening-миграцию `20260626_08_leader_order_rpc_restrict_execute.sql`;
- follow-up restore `20260626_09_leader_ensure_profile_authenticated_execute_restore.sql`;
- FK index migration `20260626_10_leader_user_invites_fk_indexes.sql`;
- grants для profile functions;
- документацию по текущему состоянию.

В ветке больше нет `.sql.todo`-заглушек.

## Advisors

Supabase performance advisor больше не показывает `unindexed_foreign_keys` для `leader_user_invites` после добавления FK indexes.

Security advisor предупреждает, что `leader_ensure_profile(text)` является `SECURITY DEFINER` и доступна `authenticated`. Это ожидаемое состояние для bootstrap/pending flow: RPC вызывается через Edge Function с JWT пользователя, проверяет `auth.uid()`, использует `auth.email()` как источник email и не доверяет произвольному входному email.

## Почему PR пока draft

SQL и Edge Function синхронизированы с тем, что применено в Supabase. Оставшаяся причина держать PR draft — ручная проверка CRM-сценариев.

Перед merge нужно проверить:

1. Вход активного пользователя.
2. Pending-доступ нового пользователя.
3. Вкладку `Доступ`.
4. Создание и закрытие приглашения.
5. Сценарий заявка → расчёт → КП `Согласовано` → заказ.
6. Повторное создание заказа из того же КП без дубля.

## Безопасное текущее состояние

Боевой Supabase-контур уже защищает новых пользователей и атомарно создаёт заказ из согласованного КП. Прямая RPC-конвертация заказа закрыта для обычных авторизованных пользователей и доступна только через Edge Function/service role. `leader_ensure_profile(text)` доступна `authenticated` для bootstrap/pending flow через JWT пользователя.