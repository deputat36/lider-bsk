# Статус проекта РА «Лидер»

Дата обновления: 2026-06-28.

## Основной контур

- основной репозиторий: `deputat36/lider-bsk`;
- основной CRM-контур: `https://deputat36.github.io/lider-bsk/crm/v4/`;
- прямая проверка вкладки `Доступ и роли`: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`;
- временная CRM v4: `https://deputat36.github.io/lidercalculator/app-v4.html`;
- публичный сайт: `https://www.lider-bsk.ru`;
- выделенная страница проверки заявки: `https://www.lider-bsk.ru/request.html`;
- Supabase project: `ofewxuqfjhamgerwzull`.

Использовать только объекты `leader_*`. Объекты `nav_*` относятся к другому проектному контуру.

Режим автономной работы закреплён в `docs/AUTOPILOT_RULES.md`.
Операционный checkpoint Codex: `docs/CODEX_OPERATING_STATUS_2026-06-28.md`.
Supabase baseline РА «Лидер»: `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`.

## Supabase

Активные функции контура РА «Лидер»:

- `leader-public-lead v9`, `verify_jwt=false`;
- `leader-crm-leads v12`, `verify_jwt=true`;
- `leader-crm-orders v2`, `verify_jwt=true`.

CRM использует Edge Functions с JWT. Прямой доступ браузера к служебным RPC закрыт. Права таблиц заявок, аудита, событий и CRM-доступа приведены к минимальной модели.

Проверка 2026-06-28:

- live `leader-public-lead v9` активна и работает в публичном режиме `verify_jwt=false`;
- live `leader-crm-leads v12` активна, `verify_jwt=true`;
- live `leader-crm-orders v2` активна, `verify_jwt=true`;
- baseline live-состояния сохранён в `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`;
- active access admins (`owner` + `admin`): 3; active `manager`: 1; inactive profiles: 0;
- `leader_user_profiles` и `leader_user_invites` имеют RLS и grants для `authenticated` только `SELECT`, `INSERT`, `UPDATE`;
- `leader_apply_profile_invite`, `leader_create_order_from_offer_rpc`, `leader_ensure_profile` доступны на execute только `{postgres,service_role}`;
- среди `public.leader_%` SECURITY DEFINER функций нет функций, доступных `anon`, `authenticated` или `public`;
- Supabase production не менялся: DDL, DML, Edge Function deploy, RLS, grants, policies и данные не трогались.

Проверка 2026-06-27:

- live `leader-public-lead v9` активна и работает в публичном режиме `verify_jwt=false`;
- `leader-public-lead v9` сохраняет контракт `request_id`, `website` honeypot, UTM, audit events и duplicate handling;
- live `leader-crm-leads v12` активна, `verify_jwt=true`;
- `leader-crm-leads v12` создаёт новый CRM-профиль как pending через service role REST после проверки JWT пользователя;
- `create_order_from_offer` в `leader-crm-leads v12` делегирует атомарную конвертацию в `leader_create_order_from_offer_rpc(jsonb)`;
- среди `public.leader_%` SECURITY DEFINER функций нет функций, доступных `anon`, `authenticated` или `public`;
- `leader_user_profiles` и `leader_user_invites` имеют RLS и grants для `authenticated` только `SELECT`, `INSERT`, `UPDATE`;
- invite/profile policies, triggers и FK indexes проверены в live Supabase;
- migration-history caveat зафиксирован в `docs/SUPABASE_MIGRATION_HISTORY_NORMALIZATION_2026-06-27.md`: текущие CRM SQL-файлы являются final-state snapshots, перед `supabase db push` / preview branches нужна нормализация истории.

Проверка 2026-06-26:

- проект `ofewxuqfjhamgerwzull` активен;
- `leader-public-lead` работает в публичном режиме `verify_jwt=false`;
- функция принимает `request_id`, `website` honeypot, UTM и данные страницы;
- `leader_leads.request_id` защищён уникальным ограничением `leader_leads_request_id_key`;
- `leader_public_lead_audit` используется для событий `accepted`, `duplicate`, `suspicious`, `rejected`, `error`;
- гранты по публичной цепочке соответствуют текущей модели: `anon` имеет `INSERT` в `leader_leads` и `leader_public_lead_audit`, `authenticated` имеет чтение аудита и `leader_request_trace`;
- Security Advisor по-прежнему показывает предупреждения по `nav_*` SECURITY DEFINER и leaked password protection, контур РА «Лидер» и публичный сайт в рамках этой задачи не менялись;
- после этапов Open Graph и PNG-обложки Supabase не изменялся: Edge Functions, таблицы, RLS, политики и данные не трогались.

Проверка 2026-06-25:

- создана read-only view `public.leader_request_trace` для трассировки `request_id` между `leader_leads` и `leader_public_lead_audit`;
- view использует `security_invoker = true`, чтобы сохранялась RLS базовых таблиц;
- `anon` и `public` не имеют прав на view;
- `authenticated` имеет только `SELECT`;
- миграции view и прав сохранены в репозитории;
- проверка `Request trace view check` защищает `security_invoker` и минимальные права доступа.

Проверка 2026-06-24:

- PostgreSQL 17.6, предупреждение о завершении поддержки PostgreSQL 14 проект не затрагивает;
- у внешних ключей `leader_*` нет отсутствующих покрывающих индексов;
- предупреждения Security Advisor по `SECURITY DEFINER` относятся к `nav_*`, их в контуре РА «Лидер» не изменяли;
- политика чтения `leader_public_lead_audit` оптимизирована через `(select auth.uid())` без изменения ролей и прав;
- `anon` по-прежнему имеет только `INSERT` в аудит, `authenticated` — только `SELECT`.

## Изоляция контуров

Основная и временная CRM размещены на одном origin `deputat36.github.io`. Ранее они использовали общий ключ `leader_crm_v4_session`, поэтому два разных Supabase-клиента могли одновременно обновлять один refresh token.

Исправление 2026-06-24:

- основной контур использует `leader_crm_v4_main_session`;
- временный контур использует `leader_crm_v4_test_session`;
- старый общий ключ удаляется как устаревший;
- выход очищает только ключ текущего контура и старый ключ;
- ключи других приложений `sb-*` и `supabase` не затрагиваются;
- подключения обновлены до `v=20260624-contour-1`;
- CI запрещает возврат к общему ключу.

После обновления требуется один повторный вход отдельно в каждую CRM. Выход и обновление токена в одном контуре больше не должны влиять на другой.

## Авторизация

В обоих контурах:

- обрабатывается `refresh_token_not_found`;
- устаревшая локальная сессия очищается;
- выход использует `scope: 'local'`;
- сбой сети при выходе не оставляет интерфейс в состоянии активной сессии.

Во временном Supabase-клиенте refresh token обновляется через единый `refreshPromise`, также реализован `auth.getUser()` для диагностики.

В журнале Supabase Auth за 2026-06-24 есть успешные входы и успешное обновление токена. Новых `refresh_token_not_found` после последней правки в доступном журнале не видно.

## Публичный сайт

Аудит 2026-06-26:

- проведён аудит публичного сайта без изменения CRM и без DDL в Supabase;
- выводы и план сохранены в `docs/PUBLIC_SITE_AUDIT.md`;
- добавлена защитная проверка `.github/workflows/public-site-audit-check.yml`;
- проверка контролирует `robots.txt`, `sitemap.xml`, sitemap-домен, отсутствие CRM/nav в sitemap, контракт публичной формы, порядок подключения `request_id` helper на `request.html`, отсутствие service-role маркеров в публичных HTML/assets;
- GitHub/Supabase доступ подтверждён, работа ведётся в `deputat36/lider-bsk`;
- безопасный этап не меняет `leader-public-lead`, таблицы, политики, RLS и данные.

Этап формы и `request_id` 2026-06-26:

- общий обработчик `assets/public-lead-form.js` читает `request_id` из ответа `leader-public-lead`;
- после успешной отправки форма показывает пользователю номер обращения на всех страницах, где используется общий виджет;
- для дубля с тем же `request_id` показывается сообщение, что заявка уже была отправлена ранее, и выводится тот же номер;
- `Request reference check`, `Static checks` и `Public site audit check` успешно прошли перед merge предыдущего PR;
- endpoint, payload, Supabase Edge Function, таблицы, политики и CRM не менялись.

Этап Open Graph 2026-06-26:

- добавлен общий фирменный OG-образ `assets/og-lider-default.svg` с холстом `1200×630`;
- на `request.html` добавлены `canonical`, Open Graph и Twitter Card мета-теги;
- на `privacy.html` добавлены `description`, `canonical`, Open Graph и Twitter Card мета-теги;
- в `sitemap.xml` добавлен `lastmod` для всех публичных URL;
- добавлена документация `docs/OPEN_GRAPH.md`;
- добавлена проверка `.github/workflows/open-graph-check.yml`.

Этап PNG-обложки Open Graph 2026-06-26:

- добавлен бинарный файл `assets/og-lider-default.png` с холстом `1200×630` для лучшей совместимости ВК/Telegram;
- `request.html` переведён с SVG на PNG в `og:image` и `twitter:image`;
- `privacy.html` переведён с SVG на PNG в `og:image` и `twitter:image`;
- `og:image:type` обновлён на `image/png`;
- SVG оставлен как редактируемый исходник;
- `Open Graph check` усилен: проверяет наличие PNG, PNG-сигнатуру и мета-теги на PNG;
- Supabase, CRM, Edge Functions, таблицы, политики и данные не менялись.

Этап удобства страницы заявки 2026-06-28:

- `request.html` обновлена до `data-request-page-version="20260628-clarity-2"`;
- добавлен блок `Выберите похожую задачу`;
- добавлены быстрые сценарии `shop`, `cafe`, `service`, `beauty`, `construction`, `office`;
- клик по сценарию использует существующий `data-scenario` механизм из `assets/public-lead-form.js` и подставляет заготовку в форму;
- endpoint, payload-контракт, Supabase Edge Function, таблицы, политики, RLS и данные не менялись;
- `Request reference check`, `Public site audit check` и `Docs checks` защищают marker `20260628-clarity-2` и сценарии от случайного удаления.

Этап расширения Open Graph 2026-06-28:

- Open Graph / Twitter Card добавлены на 8 дополнительных страниц услуг:
  - `srochnaya-reklama-borisoglebsk.html`;
  - `reklama-v-socsetyah-borisoglebsk.html`;
  - `reklama-dlya-meropriyatiy-borisoglebsk.html`;
  - `reklama-dlya-salona-krasoty-borisoglebsk.html`;
  - `reklama-dlya-servisa-masterskoy-borisoglebsk.html`;
  - `tablichki-borisoglebsk.html`;
  - `oformlenie-vitrin-borisoglebsk.html`;
  - `pechat-na-plenke-borisoglebsk.html`;
- `tools/open_graph_pages.json` расширен этими страницами;
- `Open Graph check` запускается при изменении этих страниц и проверяет конфиг через `python3 tools/apply_open_graph.py --check`;
- Supabase, CRM, Edge Functions, таблицы, политики и данные не менялись.

Найденные приоритеты:

- критично: выполнить реальную ручную проверку заявки после v9 и проверить цепочку по показанному `request_id`;
- важно: продолжить расширение Open Graph на оставшиеся коммерческие посадочные страницы; первые два пакета из 8 страниц услуг уже закрыты;
- важно: унифицировать посадочные страницы услуг в фирменном чёрно-оранжевом стиле;
- важно: унифицировать микроразметку `LocalBusiness`, `Service`, `FAQPage`, `BreadcrumbList`;
- желательно: вынести общий публичный CSS в кэшируемый файл и вести единый журнал cache-buster версий.

## Публичные заявки

`leader-public-lead v9` записывает заявку и неблокирующий аудит. Ошибки аудита журналируются маркерами:

- `leader_public_lead_audit_insert_failed`;
- `leader_public_lead_audit_request_failed`.

Текущий контракт: повторная отправка с тем же `request_id` не маскируется под `accepted`. При конфликте уникального номера обращения функция пишет audit-событие `duplicate` и возвращает клиенту `200 OK` с тем же `request_id`.

Общий обработчик сайта передаёт фактическое значение honeypot в Edge Function. Заполненный honeypot фиксируется как `suspicious` и не создаёт заявку.

На `request.html` подключён `public-lead-reference-v1.js`: после успешной отправки он показывает номер обращения из события `lead_sent`. Этот номер равен `request_id` и предназначен для точного сопоставления сайта, заявки и аудита. Порядок подключения и обязательные маркеры защищены отдельной GitHub Actions-проверкой `Request reference check`.

На `request.html` также есть блок `Выберите похожую задачу`: пользователь может выбрать типовой сценарий, а форма подставит понятную заготовку заявки. Это не меняет серверный контракт и работает поверх существующего `data-scenario` обработчика.

RLS и GRANT аудита проверены. Нужна одна реальная отправка формы после v9, чтобы сопоставить заявку и аудит по показанному номеру обращения.

## CRM v4

В основной репозиторий перенесены:

- дашборд;
- заявки, карточка, история и потребности;
- расчёты и коммерческие предложения;
- создание, список и карточка заказа;
- контроль заказов и финансов;
- производство и монтаж;
- контроль контактов;
- аудит заявок;
- вкладка `Доступ и роли` для owner/admin управления CRM-профилями и приглашениями;
- самодиагностика и адаптивный интерфейс.

Карточка заказа обновлена для фактических финансов:

- читает `leader_payments` и `leader_expenses` через обычный CRM Supabase-клиент текущего пользователя;
- показывает блок `Факт по финансам`;
- показывает план клиенту, плановую себестоимость и плановую прибыль;
- показывает получено оплат, долг клиента, фактические расходы, фактическую прибыль и отклонение `План / факт`;
- подключение обновлено до `order-card-v1.js?v=20260626-finance-1`;
- отдельная проверка `Order card finance check` защищает эти маркеры от случайного удаления.

Раздел `Аудит заявок` обновлён для текущего duplicate/request_id контракта:

- добавлен счётчик `Дубли`;
- добавлен фильтр `Дубли`;
- в карточке события есть кнопка `Скопировать request_id`;
- подключение обновлено до `public-lead-audit-v1.js?v=20260625-duplicate-copy-1`;
- добавлена подсказка `Проверка v8` со ссылкой на `request.html` и пометкой `Тест CRM v4 audit v8`;
- добавлен виджет `Проверить request_id`, который читает `leader_request_trace` и показывает статус цепочки;
- подключение helper обновлено до `public-lead-audit-helper-v1.js?v=20260625-trace-widget-1`;
- отдельные проверки `Public lead audit copy check`, `Public lead audit helper check` и `Request trace view check` защищают эти маркеры от случайного удаления.

Вкладка `Доступ и роли`:

- есть в базовом HTML меню CRM v4;
- есть в expanded menu как `Доступ и роли`;
- прямая кнопка `Открыть доступ CRM` есть в карточке `CRM готова` и ведёт на `?tab=user_admin`;
- прямой URL проверки: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`;
- route/cache marker: `20260627-access-route-1`;
- access label/cache marker: `20260628-access-label-1`;
- cache note показывает `CRM build: 20260627-access-route-1` после свежей загрузки;
- модуль `user-admin-v1.js` подключается через `auth.js?v=20260628-access-label-1` и import `user-admin-v1.js?v=20260628-access-label-1`;
- самодиагностика `Проверка загруженных разделов и доступа CRM` проверяет `Доступ`, `Маршрут Доступ`, `Прямой маршрут Доступ`, `Версия доступа` и `Build marker`;
- runbook проверки сохранён в `docs/CRM_ACCESS_TAB_CHECK_2026-06-27.md`;
- active access admins (`owner` + `admin`): 3; active `manager`: 1; inactive profiles: 0;
- новые пользователи без invite остаются pending/inactive;
- активировать и приглашать пользователей должны owner/admin;
- прямой execute CRM SECURITY DEFINER RPC закрыт для `anon`, `authenticated`, `public`.

## Следующая проверка

1. Нажать Ctrl + F5 в обеих CRM.
2. Отдельно войти в основной и временный контуры.
3. Открыть обе CRM одновременно.
4. Выйти из временной CRM и убедиться, что основная осталась авторизована.
5. Повторить в обратную сторону.
6. Открыть `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin` или нажать `Открыть доступ CRM` в карточке `CRM готова` и проверить вкладку `Доступ и роли` под owner/admin.
7. Открыть `Проверка загруженных разделов и доступа CRM` и убедиться, что есть `Доступ`, `Маршрут Доступ`, `Версия доступа: 20260627-access-route-1`, marker `20260628-access-label-1` и `Build marker`.
8. Открыть `request.html`, нажать любой сценарий в блоке `Выберите похожую задачу` и проверить, что форма подставила заготовку.
9. Отправить тестовую заявку через `request.html`, записать показанный номер обращения и найти его в аудите.
10. Вставить номер обращения в виджет `Проверить request_id` и убедиться, что цепочка показывает `Цепочка полная`.
11. Открыть карточку заказа и проверить блок `Факт по финансам`.
12. Повторно отправить ту же заявку с тем же `request_id` техническим тестом и убедиться, что audit показывает `duplicate`, а не `accepted`.
13. Пройти сценарий заявка → расчёт → КП → заказ → производство/монтаж.
14. Создать invite, войти новым пользователем и убедиться, что invite активирует профиль.
15. Войти новым пользователем без invite и убедиться, что профиль остаётся pending.
16. После слияния этапа PNG-обложки открыть GitHub Actions и проверить `Open Graph check`, `Public site audit check`, `Static checks`.
17. Открыть `request.html`, проверить наличие номерa обращения после отправки заявки.
18. Проверить предпросмотр ссылки `request.html` в Telegram/ВК: он должен использовать `assets/og-lider-default.png`.
19. Следующим SEO-этапом продолжить OG-набор на оставшиеся коммерческие посадочные страницы.

## Ограничения

- временную CRM не отключать до завершения проверки;
- старую CRM v2 не удалять без подтверждения;
- данные и политики не удалять без подтверждения владельца;
- `nav_*` не изменять в задачах РА «Лидер»;
- POST-проверки из текущего окружения блокируются внешним фильтром;
- прямые fetch/curl к GitHub Pages из текущего окружения могут блокироваться сетевой политикой;
- push-запуски GitHub Actions не отображаются в combined status API;
- публичный аудит 2026-06-26 не менял боевую функцию `leader-public-lead` и не выполнял DDL в Supabase;
- этапы Open Graph, PNG-обложки, расширения Open Graph на страницы услуг и удобства страницы заявки не меняют Supabase и CRM, только публичные SEO/UX-файлы GitHub;
- CRM SQL sync-файлы в GitHub сейчас являются final-state snapshots: перед использованием `supabase db push` или preview branches нужно выполнить migration-history normalization из `docs/SUPABASE_MIGRATION_HISTORY_NORMALIZATION_2026-06-27.md`.
