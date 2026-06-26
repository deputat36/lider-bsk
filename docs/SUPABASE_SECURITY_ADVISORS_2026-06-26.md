# Supabase Security Advisors — 2026-06-26

## Контекст

Проект Supabase: `ofewxuqfjhamgerwzull`.

После усиления и deploy публичной Edge Function `leader-public-lead` выполнена read-only проверка security advisors и инвентаризация `SECURITY DEFINER` функций в схеме `public`.

## Что уже сделано

### Edge Function `leader-public-lead`

Функция обновлена до версии `9` и оставлена публичной (`verify_jwt = false`), потому что она используется формой сайта без пользовательской авторизации.

Усиления в версии `9`:

- CORS ограничен доменами `https://www.lider-bsk.ru` и `https://lider-bsk.ru`;
- добавлена настройка `LEADER_PUBLIC_ALLOWED_ORIGINS` для расширения списка origin без изменения кода;
- добавлен лимит тела запроса `25_000` байт;
- сырые детали ошибок базы больше не возвращаются клиенту при `insert_failed`;
- детали ошибок остаются в server logs и audit payload;
- сохранены honeypot, POST-only, audit-log, нормализация телефона и обработка дублей.

Функция в Supabase после deploy:

- slug: `leader-public-lead`;
- version: `9`;
- status: `ACTIVE`;
- `verify_jwt`: `false`.

## Проверка документации Supabase

По текущей документации Supabase:

- browser-вызовы Edge Functions должны обрабатывать `OPTIONS` preflight и CORS headers;
- `verify_jwt` можно отключать для публичных endpoint-ов и внешних/webhook сценариев, но тогда защита должна быть реализована внутри функции;
- при включённом `verify_jwt` платформа ожидает именно user JWT в `Authorization`, а не API key.

Ссылки:

- https://supabase.com/docs/guides/functions/cors
- https://supabase.com/docs/guides/functions/auth-headers
- https://supabase.com/docs/guides/troubleshooting/unable-to-call-edge-function
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## Ограничение проверки

HTTP-проверка через terminal/curl из текущей среды не прошла из-за сетевой политики окружения:

```text
Forbidden. Calls to this URL via the terminal are not allowed.
```

Это не ошибка функции. Live-проверку нужно выполнить из браузера/формы сайта или через Supabase dashboard logs.

## Security Advisors

Supabase security advisor показывает предупреждения типа:

`authenticated_security_definer_function_executable`

Смысл предупреждения: `SECURITY DEFINER` функции в `public` доступны роли `authenticated` и могут вызываться через `/rest/v1/rpc/...`. Для таких функций нужно явно подтвердить, что это намеренная публичная RPC-граница, либо отозвать `EXECUTE`, перевести функцию на `SECURITY INVOKER`, либо перенести внутренние helper-функции в закрытую схему.

## Read-only инвентаризация

На момент проверки:

| Показатель | Количество |
|---|---:|
| `SECURITY DEFINER` функций в `public` | 64 |
| Из них доступны роли `authenticated` | 46 |
| Не доступны роли `authenticated` | 18 |

## Группы функций, доступных `authenticated`

| Группа | Примеры | Риск | Рекомендуемое действие |
|---|---|---|---|
| Access helpers | `nav_current_role`, `nav_is_admin`, `nav_is_management`, `nav_can_view_deal`, `nav_v2_can_edit_deal` | Средний/высокий | Проверить, не раскрывают ли helper-ы данные по произвольному `p_uid`; по возможности заменить параметры пользователя на `auth.uid()` внутри функции. |
| Read API | `nav_v2_get_dashboard`, `nav_v2_get_deals_list`, `nav_v2_get_deal_card`, `nav_v2_get_lawyer_queue` | Высокий | Оставлять доступ только если внутри функции есть строгая проверка роли и области видимости. Для внутренних API лучше использовать service role через Edge Function. |
| Create mutations | `nav_v2_add_comment`, `nav_v2_add_document`, `nav_v2_add_expense`, `nav_v2_add_risk`, `nav_v2_add_task` | Высокий | Проверить каждую функцию на `auth.uid()`, роль пользователя, права на сделку и ограничения статусов. |
| Update mutations | `nav_v2_update_deal_status`, `nav_v2_update_document_status`, `nav_v2_update_task_status`, `nav_v2_update_user_profile` | Критичный | Приоритетная проверка. Обновляющие RPC должны иметь внутренний authorization guard и не доверять `p_uid` из клиента. |
| Demo/admin functions | `nav_v2_clear_demo_data`, `nav_v2_seed_demo_data` | Критичный | Убрать `EXECUTE` у `authenticated`, если функции не нужны обычным пользователям. Если нужны только администратору — оставить через отдельную admin Edge Function или строгий guard. |
| Leader CRM | `leader_ensure_profile` | Средний | Проверить необходимость прямого вызова с клиента. Функция уже была предметом отдельных hardening-миграций, поэтому менять только после проверки текущего frontend-flow. |

## Приоритет исправлений

1. `nav_v2_clear_demo_data`, `nav_v2_seed_demo_data` — demo/admin функции не должны быть массово доступны обычным authenticated-пользователям.
2. `nav_v2_update_user_profile` — особенно чувствительная функция, потому что может затрагивать роли, менеджера, телефон и активность пользователя.
3. `nav_v2_update_deal_status`, `nav_v2_update_document_status`, `nav_v2_update_task_status` — функции изменения статусов должны строго проверять права и допустимые переходы.
4. `nav_v2_link_user_by_email`, `nav_v2_list_users` — админские операции с пользователями требуют отдельной проверки.
5. Read API функции очередей и карточек — проверить, что пользователь видит только разрешённые сделки.

## Безопасный порядок следующего этапа

1. Найти frontend-вызовы каждой RPC в репозитории.
2. Разделить функции на три категории:
   - нужны клиенту напрямую;
   - нужны только Edge Functions/service role;
   - устарели или demo-only.
3. Для функций, которые нужны клиенту напрямую:
   - проверить тело функции;
   - заменить доверие к `p_uid` на `auth.uid()` там, где возможно;
   - убедиться, что роль и доступ к сделке проверяются внутри функции.
4. Для функций, которые не должны вызываться клиентом:
   - `REVOKE EXECUTE ON FUNCTION ... FROM authenticated;`
   - при необходимости оставить `EXECUTE` только `service_role`.
5. После каждой группы изменений запускать Supabase security advisors повторно.

## Чего не делать без проверки

- Не отзывать `EXECUTE` массово у всех 46 функций одним SQL-запросом.
- Не переводить все функции с `SECURITY DEFINER` на `SECURITY INVOKER` автоматически.
- Не менять функции, которые участвуют в RLS-политиках или триггерах, без проверки зависимостей.
- Не доверять параметрам `p_uid`, `p_role`, `p_user_id`, если они приходят из клиента.

## Следующий практический шаг

Начать с группы demo/admin:

- `nav_v2_clear_demo_data()`;
- `nav_v2_seed_demo_data()`.

Для них нужно:

1. Найти frontend-вызовы.
2. Подтвердить, используются ли они в production UI.
3. Если не используются обычными пользователями — подготовить миграцию на отзыв `EXECUTE` у `authenticated`.
