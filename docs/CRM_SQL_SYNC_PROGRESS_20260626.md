# CRM SQL sync progress — 2026-06-26

Статус: replacement PR #31 merged в `main`. Текущий production Supabase project: `ofewxuqfjhamgerwzull`.

Цель документа: зафиксировать, какие CRM SQL/Edge изменения перенесены в GitHub и какое live-состояние подтверждено в Supabase.

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

10. `20260627_01_leader_user_invites_restrict_authenticated_grants.sql`
    - повторно ограничивает grants `leader_user_invites` для `authenticated` до `select, insert, update`.

11. `20260627_02_leader_profiles_insert_pending_policy.sql`
    - фиксирует safe self-insert policy: новый пользователь может создать только собственный pending-профиль `manager`, `is_active=false`, `permissions={}`.

## Удалено из PR перед merge

`20260626_09_leader_ensure_profile_authenticated_execute_restore.sql` удалена, потому что текущий live/main hardening намеренно закрывает `leader_ensure_profile(text)` от `authenticated` после деплоя Edge Function.

## Edge Function

- Live Supabase `leader-crm-leads`: version 12, `ACTIVE`, `verify_jwt=true`.
- Version 12 делает `ensure_profile` через service role REST после проверки JWT пользователя.
- `create_order_from_offer` делегирует атомарную конвертацию в `/rest/v1/rpc/leader_create_order_from_offer_rpc` с `p_payload`.
- GitHub `supabase/functions/leader-crm-leads/index.ts` синхронизирован с deployed version 12.

## Проверка Supabase

Проверено по живой базе:

- `leader_create_order_from_offer_rpc(p_payload jsonb)` существует;
- результат функции: `jsonb`;
- `security definer`: включён;
- `search_path=public`;
- execute на `leader_create_order_from_offer_rpc(jsonb)` есть только у `postgres` и `service_role`;
- execute на `leader_apply_profile_invite()` есть только у `postgres` и `service_role`;
- execute на `leader_ensure_profile(text)` есть только у `postgres` и `service_role`;
- среди `public.leader_%` SECURITY DEFINER функций нет функций, доступных `anon`, `authenticated` или `public`;
- `leader_user_invites` существует и имеет включённый RLS;
- `leader_user_profiles` и `leader_user_invites` имеют grants для `authenticated` только `SELECT`, `INSERT`, `UPDATE`;
- invite policies и оба trigger установлены;
- FK indexes `leader_user_invites_invited_by_idx` и `leader_user_invites_accepted_user_id_idx` созданы;
- Supabase performance advisor больше не показывает `unindexed_foreign_keys` для `leader_user_invites`.

## `.sql.todo`

В `main` больше нет `.sql.todo`-заглушек.

## CI / connector note

После merge GitHub connector возвращал пустые status/workflow lists для direct-push commits на `main`, поэтому Actions-состояние direct-push commit через connector не подтверждено.

## Migration naming note

Часть SQL-файлов CRM sync сохранена как manual snapshot-файлы с префиксами вида `20260626_01...`, а production migration history Supabase использует 14-значные версии (`20260626113344...`, `20260626175044...` и т.д.). Это не runtime-блокер: live DB уже проверена и соответствует ожидаемому состоянию.

Подробная карта и безопасный порядок нормализации зафиксированы в `docs/SUPABASE_MIGRATION_HISTORY_NORMALIZATION_2026-06-27.md`.

Если проект начнёт использовать `supabase db push`/preview branches как основной deploy-путь, нужно отдельно нормализовать локальную migration history под production history, чтобы не получить drift между GitHub и `supabase_migrations.schema_migrations`.

## Текущее безопасное правило

Не делать новых изменений в CRM access/RPC без повторной проверки:

1. GitHub source на `main`;
2. live Edge Function `leader-crm-leads`;
3. grants/RLS/policies/triggers в Supabase;
4. ручных CRM-сценариев входа, pending-доступа, вкладки `Доступ`, приглашений и конвертации КП в заказ без дублей.
