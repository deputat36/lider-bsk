# Статус проекта РА «Лидер»

Дата обновления: 2026-07-10.

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

## Быстрый старт CRM

Обновление 2026-07-12:

- технические заглушки «CRM готова» и «Автопилот проверки» заменены встроенным маршрутом обучения из пяти рабочих шагов;
- маршрут ведёт пользователя по цепочке заявка → потребность → расчёт/КП → заказ → производство/монтаж;
- кнопки перехода учитывают доступность разделов для текущей роли;
- прогресс и свёрнутое состояние хранятся только в браузере и не создают записи в Supabase;
- быстрый старт автоматически отмечает доказанные шаги: следующий контакт, потребность с полнотой от 80, КП, заказ и успешное завершение производства/монтажа;
- отменённые production/installation статусы не считаются успешным завершением обучения;
- интерфейс прямо предупреждает не создавать вымышленных клиентов в production;
- добавлены behavior test, source checker, manual test и отдельная GitHub Actions проверка.

## Supabase

Активные функции контура РА «Лидер»:

- `leader-public-lead v9`, `verify_jwt=false`;
- `leader-crm-leads v12`, `verify_jwt=true`;
- `leader-crm-orders v2`, `verify_jwt=true`.

CRM использует JWT и RLS. Полный аудит 2026-07-10 выявил два приоритетных архитектурных хвоста: прямой `anon INSERT` в публичные таблицы позволяет обойти Edge Function, а серверная CRM-проверка подтверждает активный профиль без action-level ограничения по роли. Production-права в рамках аудита не менялись.

Проверка 2026-07-10:

- проект `ofewxuqfjhamgerwzull` активен и имеет статус `ACTIVE_HEALTHY`;
- live `leader-public-lead v9`, `leader-crm-leads v12`, `leader-crm-orders v2` активны;
- `leader_leads.request_id` защищён уникальным ограничением;
- `leader_request_trace` использует `security_invoker=true`, `anon/public` не имеют чтения;
- read-only SQL показал 12 заявок, одну заявку с `request_id`, одно audit-событие и одну полную трассировку;
- `duplicate`, `suspicious`, `rejected`, `error` пока не доказаны production end-to-end тестом;
- `anon` всё ещё имеет прямой `INSERT` в `leader_leads` и `leader_public_lead_audit`; целевой hardening описан, но не применён;
- активные роли: owner — 2, admin — 1, manager — 1;
- UI-матрица содержит будущие роли, но серверная action-level авторизация ещё не реализована;
- полный отчёт: `docs/FULL_SITE_CRM_AUDIT_2026-07-10.md`;
- план: `docs/SITE_CRM_IMPROVEMENT_PLAN_2026-07-10.md`;
- Supabase production не менялся: DDL, DML, deploy, RLS, grants, policies, Auth и данные не трогались.

Проверка 2026-07-09:

- проект `ofewxuqfjhamgerwzull` активен;
- Security Advisor и Performance Advisor проверены read-only;
- запись сохранена в `docs/SUPABASE_ADVISOR_2026-07-09.md`;
- performance warnings включают смешанные контуры, включая `leader_*`, но изменения индексов/RLS не применялись без отдельного анализа нагрузки;
- Supabase production не менялся: DDL, DML, Edge Function deploy, RLS, grants, policies и данные не трогались.

Проверка 2026-07-08:

- проект `ofewxuqfjhamgerwzull` активен;
- `leader-public-lead v9` активна;
- короткая запись аудита сохранена в `docs/SUPABASE_AUDIT_2026-07-08.md`;
- Supabase production не менялся: DDL, DML, Edge Function deploy, RLS, grants, policies и данные не трогались.

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

## Публичный сайт и связка с CRM

Полный аудит 2026-07-10:

- работа ведётся в ветке `audit/site-crm-full-2026-07-10`;
- создан актуальный checklist `docs/CRM_V4_AUDIT_V9_CHECK.md`;
- CRM audit helper обновлён с пользовательской маркировки v8 до v9;
- добавлен `tools/check_site_crm_chain_contract.py`;
- добавлен workflow `.github/workflows/site-crm-chain-check.yml`;
- CRM получила модуль `crm/v4/assets/v4/public-lead-request-id-v1.js`, который показывает и копирует `request_id` в обычном списке и карточке заявки;
- архитектурные решения по public ingestion и role/action authorization записаны в `docs/DECISIONS.md`;
- live browser/Lighthouse аудит ограничен сетевым DNS-доступом среды и остаётся ручным этапом;
- production Supabase не менялся.

UI и аудит 2026-07-08:

- вспомогательный скрипт главной `assets/packages-link.js` отвечает за защиту шапки, короткое верхнее меню, компактный hero-блок, блок популярных ссылок и мобильное меню;
- мобильное меню закрывается по кнопке и по клику на пункт навигации;
- добавлена проверка `tools/check_public_homepage_helper.py`;
- `.github/workflows/public-site-audit-check.yml` запускает `node --check assets/packages-link.js` и `python3 tools/check_public_homepage_helper.py`;
- добавлен отдельный workflow `.github/workflows/public-no-secret-markers-check.yml` для проверки публичных HTML/assets на служебные Supabase-маркеры;
- открытый хвост: cache version для `assets/packages-link.js` в `index.html` пока не обновлён из-за риска безопасной правки большого inline-файла.

Аудит 2026-06-26:

- проведён аудит публичного сайта без изменения CRM и без DDL в Supabase;
- выводы и план сохранены в `docs/PUBLIC_SITE_AUDIT.md`;
- добавлена защитная проверка `.github/workflows/public-site-audit-check.yml`;
- проверка контролирует `robots.txt`, `sitemap.xml`, sitemap-домен, отсутствие CRM/nav в sitemap, контракт публичной формы, порядок подключения `request_id` helper на `request.html`, отсутствие service-role маркеров в публичных HTML/assets;
- GitHub/Supabase доступ подтверждён, работа ведётся в `deputat36/lider-bsk`.

## Исторические CI guard markers

Этот блок сохраняет точные исторические формулировки, которые используются действующими workflow документации. Он не отменяет актуальный статус 2026-07-10.

- Исторический checkpoint: Дата обновления: 2026-06-28.
- Быстрый путь: Открыть доступ CRM через `?tab=user_admin`; раздел называется `Доступ и роли`.
- Историческая сводка: active access admins (`owner` + `admin`): 3; inactive profiles: 0.
- Проверка публичной цепочки: `Проверить request_id` и получить статус `Цепочка полная`.
- Request UI marker: `20260628-clarity-2`; пользователь видит блок `Выберите похожую задачу`.
- Этап расширения Open Graph 2026-06-28.
- Контрольные страницы: `srochnaya-reklama-borisoglebsk.html`, `reklama-dlya-servisa-masterskoy-borisoglebsk.html`, `tablichki-borisoglebsk.html`, `oformlenie-vitrin-borisoglebsk.html`, `pechat-na-plenke-borisoglebsk.html`.
- Исторический статус пакета: первые два пакета из 8 страниц услуг уже закрыты.
- CRM access cache marker: `20260628-access-label-1`.

