# Ужесточение anon EXECUTE для служебных leader_* RPC

Дата аудита: 21 июля 2026 года.

## Обнаружено в production

Избыточное право `EXECUTE` для роли `anon` было обнаружено у функций:

- `public.leader_add_status_history(uuid, text, text, text)`;
- `public.leader_create_task(text, uuid, text, text, timestamptz, text)`;
- `public.leader_dashboard_metrics()`;
- `public.leader_normalize_invite_email()`.

Первые три функции имели явный grant роли `anon`. У trigger-функции `leader_normalize_invite_email()` дополнительно существовал grant роли `PUBLIC`, из-за чего анонимный доступ сохранялся бы даже после обычного `REVOKE ... FROM anon`.

## Почему непосредственная утечка не подтверждена

- рабочие таблицы защищены RLS;
- политики `leader_orders`, `leader_clients`, `leader_tasks` и `leader_order_status_history` назначены роли `authenticated`;
- `leader_add_status_history()` и `leader_create_task()` дополнительно вызывают `leader_has_access()`;
- публичная вставка отдельно разрешена только для `leader_leads` и ограничена проверками полей.

Избыточный grant всё равно нарушает принцип минимальных привилегий и создаёт лишнюю внешнюю RPC-поверхность.

## Особенность staging

Проект `lider-bsk-staging` использует отдельную синтетическую схему и не содержит перечисленных функций. Применять production-миграцию к нему нельзя: это не реплика рабочей базы.

## Миграция

`supabase/migrations/20260721123000_revoke_anon_execute_leader_internal_rpcs.sql`

Миграция:

- отзывает только анонимный доступ;
- сохраняет существующие права `authenticated` и `service_role`;
- удаляет транзитивный `PUBLIC EXECUTE` у trigger-функции;
- завершается ошибкой, если хотя бы один анонимный маршрут остаётся;
- проверяет, что ключевые права `authenticated` не потеряны.

## Проверка перед production

1. Снять ACL-снимок четырёх функций.
2. Убедиться, что frontend не вызывает эти RPC с publishable/anon key.
3. Применить миграцию в короткое окно наблюдения.
4. Проверить вход в CRM, dashboard, создание задачи и историю статусов под реальным сотрудником.
5. Проверить создание публичной заявки через `leader-public-lead`.
6. Повторно запустить security advisors.

## Откат

Точный rollback сохранён в:

`docs/ROLLBACK_REVOKE_ANON_LEADER_INTERNAL_RPCS_2026-07-21.sql`

Production Supabase в рамках подготовки PR не изменяется.
