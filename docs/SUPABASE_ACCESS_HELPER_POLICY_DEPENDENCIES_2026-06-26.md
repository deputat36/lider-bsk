# Supabase access helper dependencies — 2026-06-26

Проект Supabase: `ofewxuqfjhamgerwzull`.

## Цель проверки

После сокращения прямой RPC-поверхности `SECURITY DEFINER` функций осталась группа access helper-ов:

- `nav_v2_can_view_deal(p_deal_id uuid, p_uid uuid)`;
- `nav_v2_can_edit_deal(p_deal_id uuid, p_uid uuid)`;
- `nav_v2_my_role(p_uid uuid)`;
- `nav_v2_is_owner_or_admin(p_uid uuid)`;
- `nav_v2_is_active_user(p_uid uuid)`;
- legacy helper-ы `nav_can_view_deal`, `nav_can_edit_deal`, `nav_current_role`, `nav_is_admin`, `nav_is_management`, `nav_user_role_of`.

Их нельзя закрывать тем же простым `REVOKE EXECUTE ... FROM authenticated`, пока не проверены зависимости: часть helper-ов используется в RLS-политиках.

## Проверка frontend-вызовов

В репозитории `deputat36/lider-bsk` прямых frontend-вызовов для основных v2 helper-ов не найдено, кроме упоминаний в документации аудита:

- `nav_v2_can_view_deal` — прямой вызов из frontend не найден;
- `nav_v2_can_edit_deal` — прямой вызов из frontend не найден;
- `nav_v2_my_role` — прямой вызов из frontend не найден;
- `nav_v2_is_owner_or_admin` — прямой вызов из frontend не найден;
- `nav_v2_is_active_user` — прямой вызов из frontend не найден.

## Проверка RLS-политик

Read-only запрос к `pg_policies` показал, что helper-ы активно используются в политиках таблиц:

| Таблица | Примеры политик / helper-ов |
|---|---|
| `nav_deals_v2` | `nav_v2_can_view_deal`, `nav_v2_can_edit_deal`, `nav_v2_is_active_user` |
| `nav_deal_documents_v2` | `nav_v2_can_view_deal`, `nav_v2_can_edit_deal` |
| `nav_deal_comments_v2` | `nav_v2_can_view_deal` |
| `nav_deal_reviews_v2` | `nav_v2_can_view_deal`, `nav_v2_my_role` |
| `nav_deal_risks_v2` | `nav_v2_can_view_deal`, `nav_v2_can_edit_deal` |
| `nav_deal_tasks_v2` | `nav_v2_can_view_deal` |
| `nav_deal_participants_v2` | `nav_v2_can_view_deal`, `nav_v2_can_edit_deal` |
| `nav_deal_answers_v2` | `nav_v2_can_view_deal`, `nav_v2_can_edit_deal` |
| `nav_user_profiles` | `nav_v2_is_owner_or_admin`, `nav_v2_my_role` |
| legacy `nav_*` tables | `nav_can_view_deal`, `nav_can_edit_deal`, `nav_current_role`, `nav_is_admin` |

## Решение

DDL не применялся.

`REVOKE EXECUTE` для access helper-ов сейчас не выполняется, потому что это может сломать RLS-проверки и доступ к таблицам. Эти функции нужно выносить в отдельный этап с тестом RLS negative/positive cases.

## Безопасный следующий шаг

1. Проверить, требуют ли RLS-политики `EXECUTE` у `authenticated` для helper-функций во время выполнения запросов.
2. Если да — оставить helper-ы доступными и принять advisor-warning как намеренную внутреннюю поверхность, либо перенести helper-ы/политики в более безопасную архитектуру.
3. Если нет — закрывать только после тестов на реальные таблицы: сделки, документы, комментарии, задачи, профили.
4. Следующим более безопасным кандидатом для hardening остаются legacy/wizard/rework RPC, которые не являются RLS-helper-ами.
