# CRM SQL sync progress — 2026-06-26

Активная ветка PR #24: `crm-hardening-main-20260626-synced`.

Цель: синхронизировать GitHub с тем, что уже применено в Supabase project `ofewxuqfjhamgerwzull`.

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
   - `leader_ensure_profile(text)` доступна `authenticated`;
   - `leader_apply_profile_invite()` закрыта от прямого execute для `anon`, `authenticated`, `public`.

8. `20260626_08_leader_order_rpc_restrict_execute.sql`
   - hardening-миграция для уже применённых контуров;
   - повторно закрывает прямой execute `leader_create_order_from_offer_rpc(jsonb)` для `anon`, `authenticated`, `public`;
   - оставляет execute только для `service_role`.

9. `20260626_09_leader_ensure_profile_authenticated_execute_restore.sql`
   - follow-up restore после обнаруженного live ACL drift;
   - явно возвращает `EXECUTE` на `leader_ensure_profile(text)` роли `authenticated`;
   - оставляет `service_role`;
   - закрывает `anon` и `public`.

10. `20260626_10_leader_user_invites_fk_indexes.sql`
    - закрывает Supabase performance advisor `unindexed_foreign_keys` для новой таблицы invite;
    - добавляет `leader_user_invites_invited_by_idx`;
    - добавляет `leader_user_invites_accepted_user_id_idx`.

## Перенесено в GitHub по Edge Function

- `supabase/functions/leader-crm-leads/index.ts` соответствует deployed version 10.
- `ensure_profile` вызывает `/rest/v1/rpc/leader_ensure_profile` с JWT пользователя.
- Прямая вставка активного профиля через service role удалена.
- `create_order_from_offer` вызывает `leader_create_order_from_offer_rpc` через service role.

## `.sql.todo`

В ветке больше нет `.sql.todo`-заглушек. Оба временных файла заменены исполняемыми SQL-миграциями.

## Проверка Supabase

Проверено по живой базе:

- `leader_create_order_from_offer_rpc(p_payload jsonb)` существует;
- результат функции: `jsonb`;
- `security definer`: включён;
- `search_path=public`;
- тело функции в базе: 9341 символа;
- md5 тела функции: `85a8b2b5d0c352f79fce0f516a9f26dc`;
- execute на `leader_create_order_from_offer_rpc(jsonb)` есть только у `postgres` и `service_role`;
- execute на `leader_apply_profile_invite()` есть только у `postgres` и `service_role`;
- execute на `leader_ensure_profile(text)` есть у `authenticated`, `postgres`, `service_role`;
- `leader_user_invites` существует и имеет включённый RLS;
- invite policies и оба trigger установлены;
- FK indexes `leader_user_invites_invited_by_idx` и `leader_user_invites_accepted_user_id_idx` созданы;
- Supabase performance advisor больше не показывает `unindexed_foreign_keys` для `leader_user_invites`.

## Advisors

Оставшееся security advisor-предупреждение по `leader_ensure_profile(text)` ожидаемо: это `SECURITY DEFINER` RPC, сознательно доступная роли `authenticated`, потому что Edge Function `ensure_profile` вызывает её с пользовательским JWT для bootstrap/pending flow. Функция проверяет `auth.uid()`, берёт email из `auth.email()` и отклоняет несовпадающий входной email.

Новые индексы `leader_user_invites_*_idx` могут временно отображаться как `unused_index`, пока по ним нет статистики использования.

## CI

CI был зелёный на head `aa105cdf7fa1be698955a8e594cc2541a74d4bf2`:

- Static checks;
- CRM auth checks;
- CRM access admin check;
- Docs checks;
- Request trace view check;
- Order card finance check;
- Public lead audit helper/copy checks.

После добавления `20260626_10` CI должен пройти повторно на новом head.

## Текущее безопасное правило

PR #24 не переводить из draft и не мержить, пока не пройдёт CI на текущей ветке и не будут вручную проверены CRM-сценарии входа, pending-доступа, вкладки `Доступ`, приглашений и конвертации КП в заказ без дублей.