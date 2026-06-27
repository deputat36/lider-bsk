# CRM SQL sync progress — 2026-06-26

Активный replacement PR: #31 `crm-hardening-main-20260626-latest`.

Цель: синхронизировать GitHub с тем, что уже применено в Supabase project `ofewxuqfjhamgerwzull`, без отката hardening из текущего `main`.

## Перенесено в GitHub SQL-файлами

1. `20260626_01_leader_user_invites_table.sql`
   - таблица `leader_user_invites`;
   - индексы;
   - RLS;
   - базовые grants.

2. `20260626_02_leader_user_invites_policies.sql`
   - FK на `leader_user_profiles`;
   - policies для owner/admin через `leader_private.leader_is_admin()`.

3. `20260626_03_leader_user_invites_normalize.sql`
   - `leader_normalize_invite_email()`;
   - trigger `leader_user_invites_normalize_trg`.

4. `20260626_04_leader_apply_profile_invite.sql`
   - `leader_apply_profile_invite()`;
   - trigger `leader_apply_profile_invite_trg`;
   - активация нового CRM-профиля только по действующему invite;
   - новый пользователь без invite остаётся inactive/pending.

5. `20260626_05_leader_ensure_profile_pending.sql`
   - обновлённая `leader_ensure_profile(text)`;
   - email берётся из `auth.email()`;
   - новый пользователь без invite создаётся как `is_active=false`.

6. `20260626_06_leader_order_from_offer_rpc.sql`
   - `leader_create_order_from_offer_rpc(jsonb)`;
   - атомарная конвертация согласованного КП в заказ;
   - блокировка КП, расчёта и заявки на время операции;
   - защита от повторного создания дубля заказа;
   - перенос позиций расчёта в позиции заказа;
   - запись события КП и истории статуса заказа;
   - прямой execute закрыт для `anon`, `authenticated`, `public`, вызов оставлен только для `service_role`.

7. `20260626_07_leader_profile_function_grants.sql`
   - `leader_ensure_profile(text)` доступна только `service_role` среди runtime roles;
   - `leader_ensure_profile(text)` закрыта для `anon`, `authenticated`, `public`;
   - `leader_apply_profile_invite()` закрыта от прямого execute для `anon`, `authenticated`, `public` и доступна `service_role`.

8. `20260626_08_leader_order_rpc_restrict_execute.sql`
   - повторно закрывает прямой execute `leader_create_order_from_offer_rpc(jsonb)` для `anon`, `authenticated`, `public`;
   - оставляет execute только для `service_role`.

9. `20260626_10_leader_user_invites_fk_indexes.sql`
   - закрывает Supabase performance advisor `unindexed_foreign_keys` для новой таблицы invite;
   - добавляет `leader_user_invites_invited_by_idx`;
   - добавляет `leader_user_invites_accepted_user_id_idx`.

## Удалено из PR

`20260626_09_leader_ensure_profile_authenticated_execute_restore.sql` удалена, потому что текущий live/main hardening намеренно закрывает `leader_ensure_profile(text)` от `authenticated` после деплоя Edge Function version 11.

## Edge Function

- Live Supabase `leader-crm-leads`: version 11, `ACTIVE`, `verify_jwt=true`.
- Version 11 делает `ensure_profile` через service role REST после проверки JWT пользователя.
- PR #31 не должен возвращать старый путь `/rest/v1/rpc/leader_ensure_profile` с пользовательским JWT.

## Проверка Supabase

Проверено по живой базе:

- `leader_create_order_from_offer_rpc(p_payload jsonb)` существует;
- результат функции: `jsonb`;
- `security definer`: включён;
- `search_path=public`;
- execute на `leader_create_order_from_offer_rpc(jsonb)` есть только у `postgres` и `service_role`;
- execute на `leader_apply_profile_invite()` есть только у `postgres` и `service_role`;
- execute на `leader_ensure_profile(text)` есть только у `postgres` и `service_role`;
- `leader_user_invites` существует и имеет включённый RLS;
- invite policies и оба trigger установлены;
- FK indexes `leader_user_invites_invited_by_idx` и `leader_user_invites_accepted_user_id_idx` созданы;
- Supabase performance advisor больше не показывает `unindexed_foreign_keys` для `leader_user_invites`.

## `.sql.todo`

В ветке больше нет `.sql.todo`-заглушек.

## CI

CI должен проверяться на текущем head PR #31 после удаления restore-миграции и синхронизации Edge Function с live/main v11.

## Текущее безопасное правило

PR #31 не переводить из draft и не мержить, пока не пройдёт CI на текущей ветке и не будут вручную проверены CRM-сценарии входа, pending-доступа, вкладки `Доступ`, приглашений и конвертации КП в заказ без дублей.
