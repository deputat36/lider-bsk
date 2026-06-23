# Статус проекта РА «Лидер»

Дата обновления: 2026-06-23.

## Основной контур

Основной репозиторий сайта и CRM:

`deputat36/lider-bsk`

Временная рабочая CRM v4:

`https://deputat36.github.io/lidercalculator/app-v4.html`

Основной публичный сайт:

`https://www.lider-bsk.ru`

Supabase project:

`ofewxuqfjhamgerwzull`

Для задач РА «Лидер» использовать только таблицы `leader_*`. Таблицы `nav_*` относятся к другому проекту и не используются.

## Supabase

Проверено через Supabase:

- `leader-public-lead` активна, версия 6, публичная, без JWT;
- `leader-crm-leads` активна, версия 8, JWT включён;
- `leader-crm-orders` активна, версия 2, JWT включён;
- исходник `leader-crm-leads v8` сохранён в основном репозитории: `supabase/functions/leader-crm-leads/index.ts`;
- исходник `leader-crm-orders v2` сохранён в основном репозитории: `supabase/functions/leader-crm-orders/index.ts`;
- в `leader-crm-leads` есть действия `ensure_profile` и `create_order_from_offer`;
- в `leader-crm-orders` есть действия `list` и `update`;
- подготовка профиля CRM v4 перенесена из прямого RPC `leader_ensure_profile` в Edge Function `leader-crm-leads`;
- прямой RPC-доступ к `leader_ensure_profile(user_email text)` отозван у `public`, `anon` и `authenticated` миграцией `revoke_authenticated_execute_leader_ensure_profile`;
- `service_role` сохранил выполнение `leader_ensure_profile`, `leader_log`, `leader_get_leads_for_crm()` и `leader_create_order_rpc(jsonb)` для служебных сценариев;
- `leader_lead_events` и `leader_commercial_offer_events` существуют в live DB;
- RLS для event-таблиц включён;
- лишние GRANT для `anon` на event-таблицах отозваны;
- доступ `authenticated` к event-таблицам ужат до `SELECT` и `INSERT`;
- политики event-таблиц разделены на `SELECT` и `INSERT`, без `UPDATE`, `DELETE`, `TRUNCATE`;
- insert-политика `leader_public_lead_audit_insert_public` ужата и больше не использует открытый `WITH CHECK true`;
- публичная запись аудита ограничена ожидаемой формой события;
- табличные GRANT для `leader_public_lead_audit` ужаты: `anon` имеет только `INSERT`, `authenticated` имеет только `SELECT`;
- миграция для фиксации прав аудита добавлена: `supabase/migrations/20260623_tighten_leader_public_lead_audit_grants.sql`;
- табличные GRANT для `leader_leads` ужаты: `anon` имеет только `INSERT`, `authenticated` имеет `SELECT`, `INSERT`, `UPDATE`, `DELETE`;
- у `leader_leads` отозваны лишние табличные права `TRUNCATE`, `REFERENCES`, `TRIGGER`, а для `anon` также `SELECT`, `UPDATE`, `DELETE`;
- миграция для фиксации прав публичных заявок добавлена: `supabase/migrations/20260623_tighten_leader_leads_grants.sql`;
- прямой RPC-доступ к `leader_log`, `leader_get_leads_for_crm()` и `leader_create_order_rpc(jsonb)` отозван у `public`, `anon` и `authenticated`;
- RLS-helper функции `leader_has_access()` и `leader_is_admin()` перенесены из `public` в приватную схему `leader_private`;
- `public.leader_has_access()` и `public.leader_is_admin()` отсутствуют;
- RLS smoke-test под ролью `authenticated` после переноса helper-функций прошёл;
- rollback smoke-test публичной вставки в `leader_leads` под ролью `anon` прошёл без создания постоянной тестовой записи;
- live RPC-проверка подтвердила, что `leader_ensure_profile`, `leader_get_leads_for_crm`, `leader_create_order_rpc` и `leader_log` не исполняются ролями `anon` и `authenticated`;
- в `public` нет `leader_*` `SECURITY DEFINER` функций, доступных `anon` или `authenticated`;
- Supabase Security Advisor больше не показывает предупреждений по `leader_*`.

Оставшиеся Advisor-предупреждения относятся к `nav_*` объектам другого проектного контура и к настройке Auth leaked password protection. Их не меняли.

## Перенос CRM v4

Перенос идёт в каталог:

`crm/v4/`

В основной репозиторий уже перенесены или добавлены:

- базовые CSS и JS CRM v4;
- UI-полировка и адаптивные стили;
- панель контактов на сегодня;
- история и комментарии заявки;
- авторизация, состояние, роутер, UI-хелперы и Supabase-клиент;
- защищённый клиент Edge Functions `functions-client.js`, который отправляет JWT текущей Supabase-сессии;
- стабильное расширенное меню CRM;
- управленческий дашборд;
- список заявок, карточка заявки, ручное создание заявки;
- потребности клиента;
- контроль контактов;
- аудит публичных заявок;
- сохранённые, типовые и нестандартные расчёты;
- коммерческие предложения;
- карточка КП;
- печать/PDF КП с HTML/CSS-логотипом;
- создание заказа из согласованного КП через `leader-crm-leads`;
- блок связанного заказа в карточке заявки;
- отдельный быстрый раздел `Заказы`;
- базовая модальная карточка заказа;
- контроль заказов;
- финансовый контроль;
- доска производства и монтажа;
- индикатор срочных производственных задач;
- карточка производственного задания;
- карточка монтажного задания;
- самодиагностика CRM v4 с проверкой статуса входа, email, роли, активности профиля, текущего раздела, URL и основных вкладок;
- отдельная инструкция по выдаче доступа тестировщику: `docs/CRM_V4_TEST_ACCESS.md`;
- отдельный чек-лист тестировщика: `docs/CRM_V4_TESTER_CHECKLIST.md`;
- персональная инструкция для администратора-тестировщика `kvmbsk@yandex.ru`: `docs/CRM_ADMIN_TESTER_ONBOARDING.md`.

`crm/v4/index.html` сейчас поддерживает:

- вход и выход;
- меню разделов: `Дашборд`, `Заявки`, `Заказы`, `Контроль заказов`, `Финансы`, `Производство`, `Контроль контактов`, `Аудит заявок`;
- загрузку списка заявок и карточки заявки;
- таймлайн заявки;
- потребности, расчёты, КП и создание заказа;
- отдельный список заказов и карточку заказа;
- контроль заказов, финансы, производство и монтаж;
- аудит публичных заявок;
- диагностический блок CRM и самопроверку доступа.

Критичные исправления:

- вход CRM больше не вызывает `leader_ensure_profile` напрямую, а использует `leader-crm-leads` action `ensure_profile`;
- `auth.js` подключён с обновлённым cache-buster `v=20260622-1`, чтобы браузер не брал старый файл из кэша;
- `site-cache-note-v1.js` подключён с обновлённым cache-buster `v=20260623-1` и импортирует свежую самопроверку `crm-ui-selfcheck-v1.js?v=20260622-2`;
- `site-cache-note-v1.js` импортирует свежий аудит `public-lead-audit-v1.js?v=20260623-1`, чтобы браузер не оставался на старом модуле аудита;
- рабочая временная CRM в `lidercalculator` обновлена тем же способом и `app-v4.html` теперь явно подключает `site-cache-note-v1.js?v=20260623-1`;
- инструкция по выдаче и снятию доступа оформлена в `docs/CRM_V4_TEST_ACCESS.md`: права задаются через `leader_user_profiles`, а не через `user_metadata`;
- инструкция для администратора-тестировщика оформлена в `docs/CRM_V4_TESTER_CHECKLIST.md` и первым делом требует проверить email, роль, активность профиля и разделы CRM через самодиагностику;
- персональная инструкция для `kvmbsk@yandex.ru` связана с `docs/CRM_V4_TEST_ACCESS.md` и `docs/CRM_V4_TESTER_CHECKLIST.md`, а снятие доступа зафиксировано через `leader_user_profiles.is_active = false`;
- старый diagnostic-модуль временной CRM больше не вызывает `leader_get_leads_for_crm()`;
- прямое клиентское создание заказа через `leader_create_order_rpc(jsonb)` закрыто;
- актуальный путь создания заказа — через Edge Function `leader-crm-leads` и действие `create_order_from_offer`.

Ограничение проверки:

- HTTP-запрос из текущего окружения к GitHub Pages и POST к Edge Function ограничен внешним фильтром, поэтому браузерная проверка в обычном браузере ещё нужна.

## Публичный сайт и аудит заявок

Выполнено:

- публичная форма передаёт `request_id`, `page_path`, `submitted_at` и технические данные источника;
- повторный клик по отправке блокируется на клиенте до завершения запроса;
- создана таблица `leader_public_lead_audit`;
- RLS для `leader_public_lead_audit` включён;
- чтение аудита доступно активным сотрудникам ролей `owner`, `admin`, `manager`;
- запись аудита разрешена публичному anon-контуру Edge Function, но ограничена ожидаемой формой события;
- табличные права аудита приведены к минимальной модели: `anon INSERT`, `authenticated SELECT`;
- табличные права `leader_leads` приведены к минимальной модели для текущего контура: `anon INSERT`, `authenticated SELECT/INSERT/UPDATE/DELETE`;
- `leader-public-lead` пишет аудит для событий `accepted`, `suspicious`, `rejected`, `error`;
- CRM-раздел `Аудит заявок` показывает referer и раскрываемый payload в карточке события;
- ошибка записи аудита не блокирует получение основной заявки.

## Автоматические проверки

GitHub Actions `Static checks` проверяет:

- корректность `robots.txt`;
- XML-структуру `sitemap.xml`;
- наличие файлов, на которые ссылается `sitemap.xml`;
- наличие и базовую полноту публичной формы заявки;
- защиту от повторного скрытия логотипа публичным CSS формы;
- публичную Edge Function `leader-public-lead`: аудит, `on_conflict=request_id`, ignore-duplicates, honeypot, отказ без телефона/сообщения, статусы аудита и неблокирующую запись аудита;
- CRM Edge Function `leader-crm-leads`: service-role только серверно, JWT-проверку через `/auth/v1/user`, активный профиль, `ensure_profile`, `create_order_from_offer`, защиту от несогласованного КП и повторного заказа;
- CRM Edge Function `leader-crm-orders`: service-role только серверно, JWT-проверку через `/auth/v1/user`, активный профиль, list/update заказов и разрешённые поля обновления;
- все локальные CSS/JS ссылки из `crm/v4/index.html` на существование файлов;
- полный набор обязательных вкладок в расширенном меню и самопроверке CRM v4: `Дашборд`, `Заявки`, `Заказы`, `Контроль заказов`, `Финансы`, `Производство`, `Контроль контактов`, `Аудит заявок`;
- ключевые подключения модулей разделов CRM v4 в `crm/v4/index.html`: дашборд, заявки, контроль контактов, заказы, карточка заказа, контроль заказов, финансы, производство, производственные и монтажные карточки;
- lazy-import самопроверки и аудита публичных заявок через `site-cache-note-v1.js`;
- актуальную цепочку кэша аудита: `site-cache-note-v1.js?v=20260623-1` в `index.html` и `public-lead-audit-v1.js?v=20260623-1` внутри lazy-import;
- CRM-модуль `public-lead-audit-v1.js`: чтение `leader_public_lead_audit`, сортировку по дате, лимит 80 событий, поля `request_id`, нормализованный телефон, `source_page_path`, `page_url`, `user_agent`, `referer`, UTM, `result`, `reason`, `payload`, отображение referer и раскрываемого payload, фильтры по статусам;
- защищённый клиент Edge Functions `functions-client.js`: получение текущей сессии, передачу `Authorization: Bearer <access_token>`, вызов `/functions/v1/`;
- отсутствие `SUPABASE_SERVICE_ROLE`, `SERVICE_ROLE_KEY` и `sb_secret_*` в браузерных assets CRM v4;
- отсутствие случайно закоммиченных секретных ключей по точным признакам ключей и env-присваиваний;
- наличие ключевых файлов CRM v4;
- актуальные версии `auth.js`, `site-cache-note-v1.js`, `crm-ui-selfcheck-v1.js` и `public-lead-audit-v1.js`;
- что CRM v4 использует `leader-crm-leads` action `ensure_profile`, а не прямой клиентский вызов `leader_ensure_profile`;
- что CRM v4 assets не содержат прямых вызовов закрытых RPC `leader_ensure_profile`, `leader_get_leads_for_crm`, `leader_create_order_rpc`, `leader_log`;
- наличие миграции `supabase/migrations/20260623_tighten_leader_leads_grants.sql`;
- наличие миграции `supabase/migrations/20260623_tighten_leader_public_lead_audit_grants.sql`;
- что миграции фиксируют минимальные права для публичной формы и аудита.

GitHub Actions `Docs checks` проверяет:

- наличие `docs/CRM_V4_TEST_ACCESS.md`;
- наличие `docs/CRM_V4_TESTER_CHECKLIST.md`;
- наличие `docs/CRM_ADMIN_TESTER_ONBOARDING.md`;
- наличие `docs/NEXT_SAFE_STEPS.md`;
- рабочую ссылку временной CRM v4;
- связь инструкции доступа с чек-листом тестировщика;
- использование `leader_user_profiles` как источника прав;
- предупреждение не использовать `user_metadata` как источник прав;
- запрет трогать `nav_*`;
- роли `owner`, `admin`, `manager`;
- инструкцию снятия доступа через `is_active = false`;
- персональную инструкцию `kvmbsk@yandex.ru`: роль `admin`, блок `Проверка загруженных разделов и доступа CRM`, ссылки на `docs/CRM_V4_TEST_ACCESS.md` и `docs/CRM_V4_TESTER_CHECKLIST.md`, снятие доступа через `leader_user_profiles.is_active = false`;
- актуальность `docs/NEXT_SAFE_STEPS.md`: дата 2026-06-23, версии `leader-public-lead v6`, `leader-crm-leads v8`, `leader-crm-orders v2`, ссылка на чек-лист, описание `leader_public_lead_audit`, правило не менять live Supabase без плана, миграции и проверки;
- защиту `docs/NEXT_SAFE_STEPS.md` от возврата устаревшего плана, где аудит публичных заявок описан как ещё не сделанная будущая задача.

В `deputat36/lidercalculator` также добавлен отдельный workflow `.github/workflows/static-checks.yml`, который проверяет рабочую временную CRM v4: подключение `site-cache-note-v1.js?v=20260623-1`, импорт свежей самопроверки и аудита, а также наличие `Referer` и раскрываемых `Технических данных` в модуле аудита.

## Ближайшие задачи

1. Проверить в браузере перенесённый контур CRM v4: вход, меню, заявки, карточку заявки, таймлайн, потребности, расчёты, КП, создание заказа, связанный заказ, список заказов, карточку заказа, контроль заказов, финансы, производство, монтаж, контроль контактов, аудит заявок, диагностику.
2. Проверить аудит публичных заявок на реальной отправке формы.
3. Проверить полный сценарий: заявка → потребность → расчёт → КП → заказ → финансы → производство/монтаж.
4. При необходимости перенести отдельный рабочий стол менеджера.
5. Добавить оплаты, расходы и фактическую прибыль.
6. При необходимости добавить мягкий rate-limit публичной формы.

## Ограничения

- CRM v4 пока не полностью перенесена в `lider-bsk`.
- Рабочая версия CRM v4 остаётся в `lidercalculator` до завершения проверки.
- Старую CRM v2 не удалять до завершения переноса и проверки.
- Таблицы `nav_*` не использовать для задач РА «Лидер».
- Удаления данных, таблиц, политик и функций выполнять только после отдельного подтверждения владельца.