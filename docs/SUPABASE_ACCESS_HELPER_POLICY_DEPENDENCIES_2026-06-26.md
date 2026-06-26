# Supabase access helper dependencies — 2026-06-26

Проект Supabase: `ofewxuqfjhamgerwzull`.

## Текущее состояние

После серии REVOKE-миграций на 2026-06-26 в `public` осталось:

- `64` SECURITY DEFINER функций;
- `15` SECURITY DEFINER функций, исполняемых ролью `authenticated`;
- `49` SECURITY DEFINER функций, не исполняемых ролью `authenticated`.

Security Advisor продолжает показывать warning `authenticated_security_definer_function_executable` для этих 15 функций. Эти warning-и больше не являются списком простых кандидатов на `REVOKE`: часть функций используется в RLS-политиках, а часть является активным browser-facing API Navigator v2.

## Оставшиеся функции

### RLS helper-функции

Эти функции участвуют в RLS-политиках. Простой `REVOKE EXECUTE ... FROM authenticated` может сломать SELECT/INSERT/UPDATE/DELETE на связанных таблицах.

| Функция | Основная причина оставить до отдельного RLS-рефакторинга |
|---|---|
| `nav_can_create_deal(p_uid uuid)` | legacy `nav_deals_insert_own`; также упоминается в `nav_save_wizard_deal`, у которого уже закрыт public RPC-доступ |
| `nav_can_edit_deal(p_deal_id uuid, p_uid uuid)` | legacy policies на `nav_deals`, `nav_deal_participants`, `nav_deal_tasks` |
| `nav_can_view_deal(p_deal_id uuid, p_uid uuid)` | legacy policies на `nav_deals`, comments, events, participants, reviews, tasks |
| `nav_current_role()` | legacy policies для events/reviews |
| `nav_is_admin()` | legacy policies для events, participants, profiles |
| `nav_v2_can_edit_deal(p_deal_id uuid, p_uid uuid)` | v2 write policies для deals, documents, expenses, participants, risks, answers |
| `nav_v2_can_view_deal(p_deal_id uuid, p_uid uuid)` | v2 select/insert policies для deals, documents, comments, events, expenses, participants, reviews, risks, tasks, answers |
| `nav_v2_is_active_user(p_uid uuid)` | v2 insert policy на `nav_deals_v2` |
| `nav_v2_is_owner_or_admin(p_uid uuid)` | v2 profile policies на `nav_user_profiles`; также используется внутренними admin/user helper-функциями |
| `nav_v2_my_role(p_uid uuid)` | v2 review/profile policies; также используется внутренними action helper-функциями |

### Активные Navigator v2 RPC

Эти функции вызываются текущим frontend-кодом `assets/js/nav-v2/deal-card-v2.js`.

| Функция | Где используется |
|---|---|
| `nav_v2_get_deal_card(p_deal_id uuid)` | загрузка карточки сделки |
| `nav_v2_add_comment(p_deal_id uuid, p_body text, p_visibility text)` | комментарии и юридические quick actions |
| `nav_v2_update_deal_status(p_deal_id uuid, p_status nav_v2_deal_status)` | смена статуса сделки, quick actions, юридические действия |
| `nav_v2_update_document_status(p_document_id uuid, p_status text)` | смена статуса документов |
| `nav_v2_update_task_status(p_task_id uuid, p_status nav_v2_task_status)` | смена статуса задач |

## Уже закрытые helper/RPC из этой группы

Эти функции больше не исполняются ролью `authenticated`:

- `leader_ensure_profile(user_email text)`;
- `nav_is_management()`;
- `nav_user_role_of(p_uid uuid)`;
- `nav_save_wizard_deal(p_result jsonb)`;
- `nav_v2_save_wizard_result(p_result jsonb)`;
- `nav_v2_submit_spn_rework(p_deal_id uuid, p_body text)`;
- `nav_v2_return_spn_rework(p_deal_id uuid, p_body text)`;
- `nav_v2_add_deal_review(p_deal_id uuid, p_decision text, p_body text, p_blocks_deposit boolean, p_blocks_deal boolean)`;
- `nav_v2_get_deal_responsibility_snapshot(p_deal_id uuid)`;
- `nav_v2_get_my_profile()`.

Соответствующие миграции записаны в репозитории:

- `supabase/migrations/20260626204149_revoke_authenticated_legacy_wizard_rework_profile_rpcs_20260626.sql`;
- `supabase/migrations/20260626204925_revoke_authenticated_orphan_security_definer_helpers_20260626.sql`.

## Решение

Новый DDL на этом этапе не применяется.

Оставшиеся 15 функций нужно закрывать только через отдельный архитектурный этап:

1. Для RLS helper-функций: переписать политики или вынести helper-логику так, чтобы RLS не зависел от публично исполняемых SECURITY DEFINER функций.
2. Для активных Navigator v2 RPC: либо принять их как публичный authenticated API с внутренними проверками доступа, либо перенести действия за Edge Function/API layer и закрыть прямой RPC-доступ.
3. Перед любым `REVOKE` нужны positive/negative regression-тесты по сделкам, документам, комментариям, задачам и профилям.

## Auth warning

Отдельный warning `auth_leaked_password_protection` остаётся вне SQL-области. Его нужно включать в Supabase Auth settings, если политика проекта допускает проверку паролей через HaveIBeenPwned.
