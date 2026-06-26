# CRM SQL sync progress — 2026-06-26

Ветка: `crm-hardening-main-20260626`.

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
   - запись события КП и истории статуса заказа.

7. `20260626_07_leader_profile_function_grants.sql`
   - `leader_ensure_profile(text)` доступна `authenticated`;
   - `leader_apply_profile_invite()` закрыта от прямого execute для `anon`, `authenticated`, `public`.

## Перенесено в GitHub по Edge Function

- `supabase/functions/leader-crm-leads/index.ts` соответствует deployed version 10.
- `ensure_profile` вызывает `/rest/v1/rpc/leader_ensure_profile` с JWT пользователя.
- Прямая вставка активного профиля через service role удалена.
- `create_order_from_offer` вызывает `leader_create_order_from_offer_rpc`.

## `.sql.todo`

В ветке больше нет `.sql.todo`-заглушек. Оба временных файла заменены исполняемыми SQL-миграциями.

## Проверка Supabase

Проверено по живой базе:

- `leader_create_order_from_offer_rpc(p_payload jsonb)` существует;
- результат функции: `jsonb`;
- `security definer`: включён;
- `search_path=public`;
- тело функции в базе: 9341 символ.

## CI

CI по commit `4b0288c9b4d5fbf6e07c1f82382b6d0b28a2f97c` зелёный:

- Static checks;
- CRM auth checks;
- CRM access admin check;
- Docs checks;
- Request trace view check;
- Order card finance check;
- Public lead audit helper/copy checks.

## Текущее безопасное правило

PR #13 не переводить из draft и не мержить, пока ветка не синхронизирована с последним `main` и CI не пройдёт повторно уже после синхронизации.

На момент проверки ветка разошлась с `main`:

- ahead: 25 commits;
- behind: 3 commits.

Коммиты, которые есть в `main`, относятся к Open Graph/публичным HTML-страницам и не пересекаются с CRM/Supabase-файлами этого PR, но синхронизацию всё равно нужно выполнить перед merge.
