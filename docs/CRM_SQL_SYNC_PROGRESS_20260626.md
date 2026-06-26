# CRM SQL sync progress — 2026-06-26

Ветка: `crm-hardening-main-20260626`.

Цель: синхронизировать GitHub с тем, что уже применено в Supabase project `ofewxuqfjhamgerwzull`.

## Уже перенесено в GitHub маленькими SQL-файлами

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

4. `20260626_05_leader_ensure_profile_pending.sql`
   - обновлённая `leader_ensure_profile(text)`;
   - email берётся из `auth.email()`;
   - новый пользователь без invite создаётся как `is_active=false`.

## Временно зафиксировано как `.sql.todo`

1. `20260626_04_leader_apply_profile_invite_manual.sql.todo`
   - реальная функция и trigger уже есть в Supabase;
   - GitHub connector заблокировал создание полного SQL-файла;
   - нужно заменить `.todo` на исполняемую миграцию через local Git или GitHub web editor.

2. `20260626_06_leader_order_from_offer_rpc_manual.sql.todo`
   - реальная RPC уже есть в Supabase;
   - GitHub connector заблокировал создание полного SQL-файла;
   - нужно заменить `.todo` на исполняемую миграцию через local Git или GitHub web editor.

## Ещё не перенесено

- `supabase/functions/leader-crm-leads/index.ts`, соответствующий deployed version 9.

## Текущее безопасное правило

PR #13 не переводить из draft и не мержить, пока `.sql.todo` не заменены реальными SQL-файлами и Edge Function в GitHub не соответствует deployed version 9.
