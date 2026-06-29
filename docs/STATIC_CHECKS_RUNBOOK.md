# Проверки после релиза сайта и CRM РА «Лидер»

Дата: 2026-06-29.

## Что проверять после каждого изменения сайта

1. Главная страница открывается без ошибок.
2. `robots.txt` открывается и содержит отдельные строки `User-agent`, `Allow`, `Host`, `Sitemap`.
3. `sitemap.xml` открывается и является корректным XML.
4. Страница `https://www.lider-bsk.ru/request.html` открывается после Ctrl + F5.
5. Форма заявки отправляет данные в CRM.
6. После отправки сайт показывает номер обращения.
7. После отправки менеджер видит заявку в CRM.
8. Событие отправки появляется в CRM-разделе `Аудит заявок`.
9. Номер обращения совпадает с `request_id`.
10. Виджет `Проверить request_id` показывает `Цепочка полная`.
11. Повторный `request_id` фиксируется как `Дубль`, а не как новая заявка.

## Что проверять после каждого изменения CRM

1. Вход в CRM работает.
2. После входа открывается блок `Проверка загруженных разделов и доступа CRM`.
3. В блоке `Доступ` корректны email, роль и статус профиля.
4. Для рабочих пользователей роль должна быть одной из `owner`, `admin`, `manager`.
5. Профиль должен иметь статус `Активен`.
6. В блоке `Разделы` у всех вкладок статус `OK`.
7. В блоке `Разделы` нет строк `нет кнопки` и `дублей`.
8. В самопроверке есть ссылка на GitHub issue template `CRM v4 browser test`.
9. Список заявок загружается.
10. Карточка заявки открывается.
11. Потребности, расчёты и КП не теряют связь с заявкой.
12. Заказ создаётся только из согласованного КП.
13. Повторное создание заказа из того же КП блокируется.
14. Роли пользователей не меняются самовольно.
15. В консоли браузера нет 404 по файлам `assets/v4/`.
16. Раздел `Аудит заявок` содержит кнопку `Скопировать request_id`.
17. Раздел `Аудит заявок` содержит кнопку `Проверить цепочку`.
18. Раздел `Аудит заявок` содержит сводку `С request_id` / `Без request_id`.
19. Раздел `Аудит заявок` содержит виджет `Проверить request_id`.
20. При найденной заявке виджет трассировки содержит кнопку `Открыть заявку`.

## Что проверять в GitHub Actions

### Static checks

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
- наличие и базовую полноту `docs/CRM_V4_TESTER_CHECKLIST.md`;
- что все локальные CSS/JS ссылки из `crm/v4/index.html` ведут на существующие файлы;
- что расширенное меню `crm-v4-expanded-menu-v1.js` и самопроверка `crm-ui-selfcheck-v1.js` содержат одинаковый обязательный набор вкладок CRM v4;
- что самопроверка `crm-ui-selfcheck-v1.js` содержит прямую ссылку на GitHub issue template `crm-v4-browser-test.md`;
- что `crm/v4/index.html` подключает ключевые модульные файлы разделов CRM v4;
- что `site-cache-note-v1.js` lazy-import подключает `crm-ui-selfcheck-v1.js`, `public-lead-audit-v1.js`, `public-lead-audit-helper-v1.js` и `public-lead-audit-summary-v1.js`;
- что `public-lead-audit-v1.js` читает `leader_public_lead_audit`, берёт последние 80 событий, сортирует по дате, содержит diagnostic fields, referer, payload, фильтры по статусам, кнопку `Скопировать request_id` и кнопку `Проверить цепочку`;
- что `public-lead-audit-helper-v1.js` читает `leader_request_trace`, содержит форму `Проверить request_id`, показывает `trace_status` и умеет открыть найденную заявку;
- что `public-lead-audit-summary-v1.js` показывает `С request_id` и `Без request_id`;
- актуальные cache-buster версии `crm-ui-selfcheck-v1.js?v=20260627-access-route-1`, `public-lead-audit-v1.js?v=20260629-trace-button-1`, `public-lead-audit-helper-v1.js?v=20260629-trace-open-lead-1`, `public-lead-audit-summary-v1.js?v=20260629-request-summary-1`;
- наличие защищённого клиента Edge Functions `crm/v4/assets/v4/functions-client.js`;
- что `functions-client.js` берёт текущую Supabase-сессию и передаёт `Authorization: Bearer <access_token>`;
- что браузерные assets CRM v4 не содержат `SUPABASE_SERVICE_ROLE`, `SERVICE_ROLE_KEY` или `sb_secret_*`;
- отсутствие прямого клиентского вызова `leader_ensure_profile` из `crm/v4/assets/v4/auth.js`;
- отсутствие прямых клиентских вызовов закрытых RPC в `crm/v4/assets/v4`;
- использование `leader-crm-leads` action `ensure_profile` в CRM-авторизации;
- наличие миграции `supabase/migrations/20260623_tighten_leader_leads_grants.sql`;
- наличие миграции `supabase/migrations/20260623_tighten_leader_public_lead_audit_grants.sql`;
- наличие миграций `leader_request_trace`;
- что миграция `leader_request_trace` использует `security_invoker = true` и даёт `authenticated` только `SELECT`.

### Docs checks

Workflow:

`Docs checks`

После изменений проверить, что workflow контролирует документы доступа CRM v4:

- наличие `docs/CRM_V4_TEST_ACCESS.md`;
- наличие `docs/CRM_V4_TESTER_CHECKLIST.md`;
- наличие `docs/CRM_ADMIN_TESTER_ONBOARDING.md`;
- наличие `docs/NEXT_SAFE_STEPS.md`;
- наличие `docs/STATUS.md`;
- наличие `docs/DECISIONS.md`;
- наличие `docs/CRM_V4_BROWSER_TEST_REPORT.md`;
- наличие `docs/CRM_V4_AUDIT_V8_CHECK.md`;
- наличие `.github/ISSUE_TEMPLATE/crm-v4-browser-test.md`;
- рабочую ссылку `https://deputat36.github.io/lidercalculator/app-v4.html`;
- использование `leader_user_profiles` как источника прав CRM;
- предупреждение не использовать `user_metadata` как источник прав;
- инструкцию снятия доступа через `is_active = false`;
- наличие в чек-листе Ctrl + F5, `Проверить CRM`, `Аудит заявок`, `request_id`, `Скопировать request_id`, `Проверить цепочку`, `С request_id`, `Без request_id`, `Проверить request_id`, `Цепочка полная`;
- актуальность `docs/NEXT_SAFE_STEPS.md`: дата 2026-06-25, версии `leader-public-lead v9`, `leader-crm-leads v12`, `leader-crm-orders v2`, ключи сессий, `refreshPromise` и правило не менять live Supabase без плана, миграции и проверки;
- актуальность `docs/PUBLIC_LEAD_AUDIT.md`: текущая функция `v9`, `v8 audit contract`, `duplicate`, `Скопировать request_id`, диагностические маркеры аудита;
- актуальность `docs/DECISIONS.md`: ADR-008 про явный audit дублей и ADR-009 про трассировку через `leader_request_trace`;
- защиту документов от возврата к устаревшему `audit v7`.

### Request trace view check

Workflow:

`Request trace view check`

Проверяет:

- миграцию `supabase/migrations/20260625_create_leader_request_trace_view.sql`;
- corrective-миграцию `supabase/migrations/20260625_tighten_leader_request_trace_view_grants.sql`;
- наличие `create or replace view public.leader_request_trace`;
- наличие `security_invoker = true`;
- связь с `leader_leads`;
- связь с `leader_public_lead_audit`;
- статусы `lead_without_audit` и `audit_without_lead`;
- отзыв всех прав у `public`, `anon`, `authenticated` перед выдачей `SELECT` для `authenticated`.

### Public lead audit helper check

Workflow:

`Public lead audit helper check`

Проверяет:

- актуальное подключение `public-lead-audit-helper-v1.js?v=20260629-trace-open-lead-1`;
- ссылку на `request.html`;
- пометку `Тест CRM v4 audit v8`;
- форму `publicLeadTraceFormV1`;
- кнопку `Проверить request_id`;
- чтение `leader_request_trace`;
- статусы `trace_status`, `lead_without_audit`, `audit_without_lead`;
- кнопку `Открыть заявку` для найденной заявки.

### Public lead audit copy check

Workflow:

`Public lead audit copy check`

Проверяет:

- актуальное подключение `public-lead-audit-v1.js?v=20260629-trace-button-1`;
- кнопку `Скопировать request_id`;
- кнопку `Проверить цепочку`;
- фильтр `duplicate`;
- счётчик `Дубли`;
- уведомление `request_id скопирован`.

### Public lead audit summary check

Workflow:

`Public lead audit summary check`

Проверяет:

- актуальное подключение `public-lead-audit-summary-v1.js?v=20260629-request-summary-1`;
- addon `public-lead-audit-summary-v1.js`;
- сводку `С request_id`;
- сводку `Без request_id`;
- пересчёт через `MutationObserver`.

## Обязательные вкладки CRM v4

- `management_dashboard` — `Дашборд`;
- `leads` — `Заявки`;
- `orders` — `Заказы`;
- `order_control` — `Контроль заказов`;
- `finance_control` — `Финансы`;
- `production` — `Производство`;
- `contact_control` — `Контроль контактов`;
- `public_lead_audit` — `Аудит заявок`.

## Ключевые модульные подключения CRM v4

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
- `site-cache-note-v1.js`;
- `public-lead-audit-v1.js`;
- `public-lead-audit-helper-v1.js`;
- `public-lead-audit-summary-v1.js`.

## Актуальная цепочка кэша для аудита заявок и самопроверки

- `crm/v4/index.html` подключает `site-cache-note-v1.js`;
- `site-cache-note-v1.js` lazy-import подключает `crm-ui-selfcheck-v1.js?v=20260627-access-route-1`;
- `site-cache-note-v1.js` lazy-import подключает `public-lead-audit-v1.js?v=20260629-trace-button-1`;
- `site-cache-note-v1.js` lazy-import подключает `public-lead-audit-helper-v1.js?v=20260629-trace-open-lead-1`;
- `site-cache-note-v1.js` lazy-import подключает `public-lead-audit-summary-v1.js?v=20260629-request-summary-1`.

## Что остаётся ручной проверкой

1. Нажать Ctrl + F5 в CRM.
2. Отправить реальную тестовую заявку через `request.html`.
3. Скопировать номер обращения.
4. Найти событие в `Аудит заявок`.
5. Проверить сводку `С request_id` / `Без request_id`.
6. Нажать `Проверить цепочку` в карточке аудита.
7. Убедиться, что виджет показывает `Цепочка полная`.
8. Нажать `Открыть заявку`, если кнопка появилась.
9. Проверить, что заявка появилась в CRM только один раз.
