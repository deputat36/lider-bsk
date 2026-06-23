# Проверки после релиза сайта и CRM РА «Лидер»

Дата: 2026-06-23.

## Что проверять после каждого изменения сайта

1. Главная страница открывается без ошибок.
2. `robots.txt` открывается и содержит отдельные строки `User-agent`, `Allow`, `Host`, `Sitemap`.
3. `sitemap.xml` открывается и является корректным XML.
4. Форма заявки отправляет данные в CRM.
5. После отправки заявки менеджер видит её в CRM.
6. Повторный клик по кнопке не создаёт дубль, если серверная идемпотентность уже внедрена.
7. Событие отправки появляется в CRM-разделе `Аудит заявок`.

## Что проверять после каждого изменения CRM

1. Вход в CRM работает.
2. После входа открывается блок `Проверка загруженных разделов и доступа CRM`.
3. В блоке `Доступ` корректны email, роль и статус профиля.
4. Для рабочих пользователей роль должна быть одной из `owner`, `admin`, `manager`.
5. Профиль должен иметь статус `Активен`.
6. В блоке `Разделы` у всех вкладок статус `OK`.
7. В блоке `Разделы` нет строк `нет кнопки` и `дублей`.
8. Список заявок загружается.
9. Карточка заявки открывается.
10. Потребности, расчёты и КП не теряют связь с заявкой.
11. Заказ создаётся только из согласованного КП.
12. Повторное создание заказа из того же КП блокируется.
13. Роли пользователей не меняются самовольно.
14. В консоли браузера нет 404 по файлам `assets/v4/`.

## Что проверять в GitHub Actions

Workflow:

`Static checks`

После изменений проверить, что workflow контролирует:

- `robots.txt`;
- `sitemap.xml`;
- публичную форму заявки;
- публичную Edge Function `leader-public-lead`;
- CRM Edge Function `leader-crm-leads`;
- CRM Edge Function `leader-crm-orders`;
- отсутствие случайно закоммиченных секретных ключей;
- наличие ключевых файлов CRM v4;
- что все локальные CSS/JS ссылки из `crm/v4/index.html` ведут на существующие файлы;
- что расширенное меню `crm-v4-expanded-menu-v1.js` и самопроверка `crm-ui-selfcheck-v1.js` содержат одинаковый обязательный набор вкладок CRM v4;
- что `crm/v4/index.html` подключает ключевые модульные файлы разделов CRM v4;
- что `site-cache-note-v1.js` lazy-import подключает `crm-ui-selfcheck-v1.js` и `public-lead-audit-v1.js`;
- что `public-lead-audit-v1.js` читает `leader_public_lead_audit`, берёт последние 80 событий, сортирует по дате, содержит диагностические поля, показывает referer, раскрываемый payload и фильтры по статусам;
- актуальные cache-buster версии `auth.js`, `site-cache-note-v1.js`, `crm-ui-selfcheck-v1.js`, `public-lead-audit-v1.js`;
- наличие защищённого клиента Edge Functions `crm/v4/assets/v4/functions-client.js`;
- что `functions-client.js` берёт текущую Supabase-сессию и передаёт `Authorization: Bearer <access_token>`;
- что браузерные assets CRM v4 не содержат `SUPABASE_SERVICE_ROLE`, `SERVICE_ROLE_KEY` или `sb_secret_*`;
- отсутствие прямого клиентского вызова `leader_ensure_profile` из `crm/v4/assets/v4/auth.js`;
- отсутствие прямых клиентских вызовов закрытых RPC в `crm/v4/assets/v4`;
- использование `leader-crm-leads` action `ensure_profile` в CRM-авторизации;
- наличие миграции `supabase/migrations/20260623_tighten_leader_leads_grants.sql`;
- наличие миграции `supabase/migrations/20260623_tighten_leader_public_lead_audit_grants.sql`;
- что миграция `leader_leads` фиксирует минимальную модель прав: `anon INSERT`, `authenticated SELECT/INSERT/UPDATE/DELETE`;
- что миграция `leader_public_lead_audit` фиксирует минимальную модель прав: `anon INSERT`, `authenticated SELECT`.

Обязательные вкладки CRM v4:

- `management_dashboard` — `Дашборд`;
- `leads` — `Заявки`;
- `orders` — `Заказы`;
- `order_control` — `Контроль заказов`;
- `finance_control` — `Финансы`;
- `production` — `Производство`;
- `contact_control` — `Контроль контактов`;
- `public_lead_audit` — `Аудит заявок`.

Ключевые модульные подключения CRM v4:

- `management-dashboard-v3.js`;
- `crm-v4-expanded-menu-v1.js`;
- `leads.js`;
- `contact-control-v1.js`;
- `orders-fast-loader-v1.js`;
- `order-card-v1.js`;
- `order-control-v2.js`;
- `finance-control-v2.js`;
- `production-board-v3.js`;
- `production-alerts-v1.js`;
- `production-job-card-v2.js`;
- `installation-job-card-v2.js`;
- `site-cache-note-v1.js`.

Актуальная цепочка кэша для аудита заявок:

- `crm/v4/index.html` подключает `site-cache-note-v1.js?v=20260623-1`;
- `site-cache-note-v1.js` lazy-import подключает `public-lead-audit-v1.js?v=20260623-1`.

Для CRM-модуля `public-lead-audit-v1.js` статическая проверка контролирует:

- чтение таблицы `leader_public_lead_audit`;
- сортировку по `created_at`;
- лимит последних 80 событий;
- вывод `request_id`, нормализованного телефона, `source_page_path`, `page_url`, `user_agent`, `referer` и UTM (`utm_source`, `utm_medium`, `utm_campaign`);
- вывод `referer` отдельной строкой в карточке события;
- вывод диагностических полей `result`, `reason`, `payload`;
- раскрываемый блок `Технические данные` для `payload`;
- фильтры `Все`, `Принято`, `Подозрительно`, `Отклонено`, `Ошибки`;
- статусы `accepted`, `suspicious`, `rejected`, `error`.

Для `leader-public-lead` статическая проверка контролирует:

- запись в `leader_public_lead_audit`;
- вставку в `leader_leads` через `on_conflict=request_id`;
- `Prefer: resolution=ignore-duplicates,return=minimal`;
- отказ `phone_or_message_required`;
- honeypot-статус `honeypot_filled`;
- события аудита `accepted`, `suspicious`, `rejected`, `error`;
- правило, что ошибка аудита не блокирует получение заявки.

Для `leader-crm-leads` статическая проверка контролирует:

- наличие серверного `SUPABASE_SERVICE_ROLE_KEY` только внутри Edge Function;
- проверку JWT через `/auth/v1/user`;
- ответы `missing_token`, `bad_token`, `access_denied`;
- проверку активного профиля в `leader_user_profiles`;
- действия `ensure_profile` и `create_order_from_offer`;
- запрет создания заказа из несогласованного КП через `offer_not_approved`;
- защиту от повторного создания заказа через `already_created`;
- связь заказа с КП, расчётом, заявкой и событием `leader_commercial_offer_events`;
- ответ `unknown_action` для неизвестных действий.

Для `leader-crm-orders` статическая проверка контролирует:

- наличие серверного `SUPABASE_SERVICE_ROLE_KEY` только внутри Edge Function;
- проверку JWT через `/auth/v1/user`;
- ответы `missing_token`, `bad_token`, `access_denied`;
- проверку активного профиля в `leader_user_profiles`;
- действия `list` и `update`;
- чтение `leader_orders` с сортировкой по дате;
- обновление `status`, `payment_status`, `layout_status`, `production_status`, `layout_comment`, `deadline`;
- ответ `unknown_action` для неизвестных действий.

Закрытые RPC, которые браузерная CRM не должна вызывать напрямую:

- `leader_ensure_profile`;
- `leader_get_leads_for_crm`;
- `leader_create_order_rpc`;
- `leader_log`.

Для этих сценариев использовать Edge Function `leader-crm-leads` с JWT. Браузерная CRM должна вызывать Edge Functions через `crm/v4/assets/v4/functions-client.js`, который получает текущую Supabase-сессию и отправляет пользовательский JWT в заголовке `Authorization`.

Проверка секретов ищет признаки реальных ключей и env-присваиваний, а не каждое текстовое упоминание роли `service_role` в документации:

- `SUPABASE_SERVICE_ROLE` / `SUPABASE_SERVICE_ROLE_KEY` с `:` или `=`;
- `SERVICE_ROLE_KEY` с `:` или `=`;
- ключи формата `sb_secret_*`;
- ключи формата `sk-*`.

## Что проверять перед изменениями Supabase

1. Используются только таблицы `leader_*`.
2. Таблицы `nav_*` не затрагиваются.
3. Изменение оформлено миграцией, если меняется схема или права.
4. Нет удаления данных, полей, RLS, функций и триггеров без отдельного подтверждения владельца.
5. Понятен план отката.
6. Для новых таблиц в `public` явно проверены GRANT для Data API и RLS-политики.
7. `SECURITY DEFINER` функции `leader_*` не должны быть исполняемы напрямую ролями `anon` и `authenticated`, если это не отдельное осознанное решение.
8. Браузерная CRM должна обращаться к служебным действиям через Edge Function, а не через прямые RPC к чувствительным функциям.
9. Для публичной формы базовая модель прав должна оставаться минимальной: `leader_leads` — `anon INSERT`, `leader_public_lead_audit` — `anon INSERT`.

## Минимальный post-release checklist

```text
[ ] Главная страница работает
[ ] robots.txt валиден
[ ] sitemap.xml валиден
[ ] Форма заявки открывается
[ ] Тестовая заявка попадает в CRM
[ ] Событие тестовой заявки видно в аудите
[ ] CRM v4 открывается
[ ] Вход в CRM работает
[ ] Самодиагностика CRM показывает корректный email, роль и активный профиль
[ ] Все ключевые разделы CRM в самодиагностике имеют статус OK
[ ] Заявки отображаются
[ ] Карточка заявки открывается
[ ] Нет ошибок в консоли браузера на основном сценарии
[ ] Нет 404 по assets/v4
[ ] Не затронуты nav_* и другие чужие контуры
```

## Проверено 2026-06-23

Supabase-запрос показал, что в `public` нет `SECURITY DEFINER` функций с префиксом `leader_`, которые напрямую исполняются ролями `anon` или `authenticated`.

Live GRANT-проверка показала:

- `leader_leads`: `anon INSERT`, `authenticated DELETE/INSERT/SELECT/UPDATE`;
- `leader_public_lead_audit`: `anon INSERT`, `authenticated SELECT`.

Live RPC-проверка показала, что `leader_ensure_profile`, `leader_get_leads_for_crm`, `leader_create_order_rpc` и `leader_log` не исполняются ролями `anon` и `authenticated`.

Live Edge Function-проверка показала:

- `leader-public-lead` активна, версия 6, `verify_jwt=false`;
- `leader-crm-leads` активна, версия 8, `verify_jwt=true`;
- `leader-crm-orders` активна, версия 2, `verify_jwt=true`.
