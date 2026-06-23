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
- отсутствие случайно закоммиченных секретных ключей;
- наличие ключевых файлов CRM v4;
- актуальные cache-buster версии `auth.js`, `site-cache-note-v1.js`, `crm-ui-selfcheck-v1.js`;
- отсутствие прямого клиентского вызова `leader_ensure_profile` из `crm/v4/assets/v4/auth.js`;
- отсутствие прямых клиентских вызовов закрытых RPC в `crm/v4/assets/v4`;
- использование `leader-crm-leads` action `ensure_profile` в CRM-авторизации;
- наличие миграции `supabase/migrations/20260623_tighten_leader_leads_grants.sql`;
- наличие миграции `supabase/migrations/20260623_tighten_leader_public_lead_audit_grants.sql`;
- что миграция `leader_leads` фиксирует минимальную модель прав: `anon INSERT`, `authenticated SELECT/INSERT/UPDATE/DELETE`;
- что миграция `leader_public_lead_audit` фиксирует минимальную модель прав: `anon INSERT`, `authenticated SELECT`.

Для `leader-public-lead` статическая проверка контролирует:

- запись в `leader_public_lead_audit`;
- вставку в `leader_leads` через `on_conflict=request_id`;
- `Prefer: resolution=ignore-duplicates,return=minimal`;
- отказ `phone_or_message_required`;
- honeypot-статус `honeypot_filled`;
- события аудита `accepted`, `suspicious`, `rejected`, `error`;
- правило, что ошибка аудита не блокирует получение заявки.

Закрытые RPC, которые браузерная CRM не должна вызывать напрямую:

- `leader_ensure_profile`;
- `leader_get_leads_for_crm`;
- `leader_create_order_rpc`;
- `leader_log`.

Для этих сценариев использовать Edge Function `leader-crm-leads` с JWT.

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

Live Edge Function-проверка показала, что `leader-public-lead` активна, версия 6, `verify_jwt=false`.