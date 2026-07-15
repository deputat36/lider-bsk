# Статус проекта РА «Лидер»

Дата обновления: 2026-07-14.

## Основной контур

- основной репозиторий: `deputat36/lider-bsk`;
- основной CRM-контур: `https://deputat36.github.io/lider-bsk/crm/v4/`;
- прямая проверка вкладки `Доступ и роли`: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`;
- временная CRM v4: `https://deputat36.github.io/lidercalculator/app-v4.html`;
- публичный сайт: `https://www.lider-bsk.ru`;
- выделенная страница проверки заявки: `https://www.lider-bsk.ru/request.html`;
- Supabase production: `ofewxuqfjhamgerwzull`;
- Supabase staging: `otulfnouybahfnsycxqn`.

Использовать только объекты `leader_*`. Объекты `nav_*`, `nav-*`, `parket-*` и `broker-*` относятся к другим проектным контурам.

Режим автономной работы закреплён в `docs/AUTOPILOT_RULES.md`.
Операционный checkpoint Codex: `docs/CODEX_OPERATING_STATUS_2026-06-28.md`.
Supabase baseline РА «Лидер»: `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`.

## Навигация CRM

Обновление 2026-07-14:

- выбранный рабочий раздел сохраняется в параметре `tab`;
- обновление страницы и копирование ссылки сохраняют раздел;
- кнопки браузера «Назад» и «Вперёд» восстанавливают разрешённую вкладку;
- переход к самостоятельному разделу очищает устаревшие `lead` и `id`, сохраняя остальные query-параметры;
- активная кнопка имеет `aria-current="page"`;
- role-aware fallback продолжает использовать canonical `role-tab-permissions-v1.js`;
- навигация не добавляет Supabase-запросов и не меняет production или staging.

## Очередь внимания руководителя

Обновление 2026-07-15:

- дашборд начинает со списка «Что сделать сейчас»;
- заявка, заказ, производство, монтаж или КП показываются в очереди только один раз;
- при нескольких проблемах выбирается наиболее важное следующее действие;
- счётчик срочных рисков больше не складывает повторно один объект из нескольких категорий;
- терминальные статусы исключаются через canonical registry;
- модель использует только уже загруженные read-only данные и не добавляет Supabase-запросов;
- role matrix, projections и production/staging не изменены.

## Публичный сайт — актуальный статус

Обновление 2026-07-13:

- в `main` объединены актуальные этапы публичного сайта, включая PR #247, #248, #250, #251, #252, #257, #259 и #260;
- 55 корневых публичных HTML защищены от внутренней терминологии `CRM`, «себестоимость», «маржа», «рабочий контур» и инфраструктурных формулировок;
- телефон `8 980 245-74-71`, `tel:+79802457471` и email `zakaz@lider-bsk.ru` защищены единым contact identity contract;
- страница заявки требует пригодный email или VK-контакт и корректно обрабатывает native invalid state;
- до подтверждения issue #236 JSON-LD не может получить точный адрес, часы работы, координаты, карты или `sameAs`;
- подготовлен контролируемый browser E2E-runbook: `docs/PUBLIC_REQUEST_BROWSER_E2E_RUNBOOK_2026-07-12.md`;
- source-checker подтверждает порядок reference-helper → form, consent version, стабильный `request_id` и текущий Edge Function contract;
- read-only SQL показывает 12 заявок;
- в аудите доказан один audit-результат `accepted / lead_insert_created`;
- текущая публичная очередь сосредоточена в issues #235, #236 и #206;
- production-заявка не отправлялась, данные Supabase в ходе этих этапов не изменялись.

## Быстрый старт CRM

Обновление 2026-07-12:

- технические заглушки «CRM готова» и «Автопилот проверки» заменены встроенным маршрутом обучения из пяти рабочих шагов;
- маршрут ведёт пользователя по цепочке заявка → потребность → расчёт/КП → заказ → производство/монтаж;
- кнопки перехода учитывают доступность разделов для текущей роли;
- прогресс и свёрнутое состояние хранятся только в браузере и не создают production-строки;
- быстрый старт автоматически отмечает доказанные шаги;
- добавлен локальный учебный заказ, который не создаёт строки в Supabase;
- локальный учебный заказ имеет ролевые маршруты для менеджера, производства и монтажа;
- подсказки учитывают реально доступные вкладки;
- canonical переход `Не передано → В производстве → Готово → Выдано` проверяется registry;
- запрещённый прямой переход `Не передано → Выдано` отклоняется;
- единственный localStorage-ключ тренажёра: `leader_crm_v4_training_scenario_v1`.

## Нагрузка и SLA по ответственным

Обновление 2026-07-12:

- управленческий дашборд использует `management-workload-panel-v1.js`;
- панель показывает активные заявки, заявки без ответственного, нарушения SLA, покрытие SLA и контакты на сегодня;
- нагрузка группируется по активным owner/admin/manager;
- терминальные статусы исключаются через canonical registry;
- используются только read-only SELECT к `leader_leads` и `leader_user_profiles` с минимальными полями;
- автоматические назначения, SLA gates, backfill и server-side enforcement остаются approval-gated.

## Предупреждение готовности потребности

Обновление 2026-07-13:

- добавлены `need-readiness-model-v1.js` и `need-readiness-panel-v1.js`;
- перед расчётом и КП показывается readiness по `completeness_score` и `missing_fields`;
- потребность считается полностью готовой при балле не ниже 80 и пустом `missing_fields`;
- предупреждение advisory и не блокирует существующие write-действия;
- readiness-модуль использует уже загруженное состояние и не выполняет Supabase-запросы;
- server-side gate, изменение формулы полноты и backfill остаются approval-gated.

## Плановые и подтверждённые фактические финансы

Обновление 2026-07-13:

- добавлены `finance-plan-actual-model-v1.js` и `finance-plan-actual-panel-v1.js`;
- раздел «Финансы» отделяет плановую выручку, себестоимость и прибыль от подтверждённых денежных движений;
- отсутствие расходов не считается нулевой фактической себестоимостью;
- если плановая себестоимость есть, а подтверждённых расходов нет, фактическая прибыль не рассчитана;
- live baseline: 5 заказов, плановая выручка 115 030 ₽, плановая себестоимость 63 440 ₽, плановая прибыль 51 590 ₽, подтверждённые приходы 61 400 ₽, расходы отсутствуют;
- денежный результат показывается отдельно от фактической прибыли;
- backfill, признак полноты расходов и server-side financial-close gate остаются approval-gated.

## Локальный preview черновика дизайн-задачи

Обновление 2026-07-13:

- существующая очередь `Нужен дизайн, задачи нет` дополнена локальным preview будущей design task;
- preview доступен из очереди операционного качества и секции `Дизайн в заказе` карточки заказа;
- добавлены `design-task-draft-model-v1.js`, `design-task-draft-preview-v1.js` и `design-task-draft-entrypoints-v1.js`;
- модель использует canonical домен `design_task` из `status-transitions-v1.js`;
- доступ определяется через `design.read` и `design.write`;
- неизвестный raw-статус существующей задачи сохраняется без автоматической замены;
- безопасный command envelope использует будущую команду `design_task.create_from_order` и детерминированный idempotency key;
- payload не содержит имени клиента, телефона, оплаты, себестоимости, прибыли и внутренних комментариев;
- preview выполняет только read-only SELECT к `leader_orders`, `leader_lead_needs` и `leader_design_tasks`;
- кнопка `Создать задачу в CRM — отключено` остаётся disabled;
- production design task, event, comment или общая задача не создаются;
- добавлены behavior test, source checker, отдельный workflow и manual Browser/Network checklist;
- checker включён в общий order/full-audit путь;
- production server action, назначение дизайнера и backfill остаются approval-gated.

## Staging backend дизайн-задач

Обновление 2026-07-14:

- PR #277 добавил изолированный staging-контур database/RPC для `design_task.create_from_order`;
- staging использует exact environment guard и не содержит production data;
- private receipt, active-task uniqueness, canonical role check и atomic task + event + receipt проверены синтетическими тестами;
- forced event/receipt failures подтвердили полный rollback;
- после тестов staging business tables очищены до нуля;
- PR #279 добавил JWT-protected, RPC-only Edge Function `leader-crm-design`;
- `leader-crm-design v1` развёрнута только в staging, имеет статус `ACTIVE` и `verify_jwt=true`;
- Edge source fail-closed возвращает `wrong_environment` вне staging;
- внешний unauthenticated POST подтверждён: HTTP `401`, `UNAUTHORIZED_NO_AUTH_HEADER`;
- PR #281 добавил source-only staging transport с текущей JWT-сессией и production lock;
- production `config.js` не менялся, рабочая кнопка создания задачи остаётся отключённой;
- staging browser read-path теперь использует только column-level SELECT к `leader_orders`, `leader_lead_needs` и `leader_design_tasks`;
- RLS требует `auth.uid()`, активный профиль и canonical `design.read`;
- owner/admin/manager/designer разрешены; accountant/installer/contractor/inactive/unknown fail closed;
- private columns, browser writes, receipt SELECT и direct design RPC для `authenticated` запрещены;
- SQL role simulation подтвердила safe projections и отрицательные сценарии без создания Auth users;
- после проверки profiles/orders/needs/tasks/events/receipts снова равны нулю, environment guard равен 1;
- security/performance advisors не имеют WARN/ERROR по staging `leader_*`;
- authenticated HTTP create/replay/conflict/role и реальный read-after-success остаются непроверенными до отдельного staging Auth user;
- точный Auth/read-path/cleanup runbook: `docs/CRM_DESIGN_TASK_STAGING_TRANSPORT_RUNBOOK_2026-07-14.md`;
- production RPC, receipt, unique index, read-path policies и `leader-crm-design` отсутствуют.

## Договоры из заказа

Обновление 2026-07-13:

- добавлен source-only черновик договора из карточки заказа, связанный с issue #271;
- доступны шаблоны для услуг/изготовления, рекламных конструкций/монтажа и ремонта/обслуживания;
- из заказа подставляются только клиентские позиции и суммы, без себестоимости, подрядных цен, прибыли и внутренних комментариев;
- реквизиты Исполнителя читаются через существующий `company_legal_details_v1` или вводятся вручную в несохранённом черновике;
- персональные, банковские и паспортные реквизиты не вшиваются в публичный JavaScript;
- договор и Приложение № 1 печатаются или сохраняются в PDF средствами браузера;
- номер содержит маркер `ЧЕРНОВИК`, не проверяется на уникальность и не сохраняется;
- добавлены behavior test, source checker, manual Network proof и отдельный workflow;
- Supabase production, заказ, оплата, производство и монтаж не изменяются.

## Supabase

Активные функции production-контура РА «Лидер»:

- `leader-public-lead v10`, `verify_jwt=false`;
- `leader-crm-leads v12`, `verify_jwt=true`;
- `leader-crm-orders v2`, `verify_jwt=true`.

Активные функции staging-контура:

- `leader-crm-design v1`, `verify_jwt=true`.

Проверка 2026-07-15 — список заявок:

- добавлены сортировка, явный сброс и описание активных фильтров;
- пустой результат объясняет действующие условия;
- `status`, `source` и `sort` сохраняются только локально в браузере;
- текст поиска с возможными персональными данными не сохраняется;
- фильтрация и сортировка используют уже загруженные данные и не добавляют Supabase-запросов или записей;
- production и staging Supabase не менялись.

Проверка 2026-07-14:

- production `ofewxuqfjhamgerwzull` имеет статус `ACTIVE_HEALTHY`;
- production PostgreSQL — `17.6.1.121`, release channel `ga`;
- staging `otulfnouybahfnsycxqn` имеет статус `ACTIVE_HEALTHY`, регион `eu-west-1`, PostgreSQL 17;
- production schema check подтвердил `leader_design_tasks`, `leader_design_task_events` и `leader_design_task_comments`;
- активных неархивных production-заказов — 5;
- production-заказов с доказанной design-потребностью — 2;
- оба заказа находятся в очереди `Нужен дизайн, задачи нет`;
- всего production-потребностей `need_design=true` — 4;
- одна design-потребность имеет `completeness_score` ниже 80;
- одна design-потребность не имеет `deadline_date`;
- у design-потребностей заполнено поле `design_reason`;
- production `leader_design_tasks` — 0 строк;
- production `leader_design_task_events` — 0 строк;
- production `leader_design_task_comments` — 0 строк;
- staging read-path имеет 3 SELECT policies и exact column-level grants для `authenticated`;
- staging profiles/orders/needs/design tasks/events/receipts — 0 строк после проверки и cleanup;
- staging environment guard — 1 строка;
- staging security/performance advisors не имеют WARN/ERROR по `leader_*`;
- агрегаты проверялись без имён клиентов, телефонов, финансовых сумм, комментариев и содержимого ТЗ;
- Supabase production не менялся: DDL, DML, migrations, deploy, RLS, grants, policies, Auth, Storage, Edge Functions и данные не трогались.

Проверка 2026-06-28:

- Supabase production не менялся;
- исторический baseline сохранён в `docs/SUPABASE_RA_LIDER_BASELINE_2026-06-28.md`.

## Изоляция контуров

- основной контур использует `leader_crm_v4_main_session`;
- временный контур использует `leader_crm_v4_test_session`;
- старый общий ключ удаляется как устаревший;
- выход очищает только ключ текущего контура и старый ключ;
- ключи других приложений `sb-*` и `supabase` не затрагиваются;
- подключения обновлены до `v=20260624-contour-1`;
- CI запрещает возврат к общему ключу.

## Авторизация

- обрабатывается `refresh_token_not_found`;
- устаревшая локальная сессия очищается;
- выход использует `scope: 'local'`;
- сбой сети при выходе не оставляет интерфейс в состоянии активной сессии;
- production server-side action-level authorization остаётся открытым архитектурным этапом #202/#204.

## Публичный сайт и связка с CRM

Текущий публичный baseline 2026-07-13:

- клиентский сайт, форма, контакты и JSON-LD защищены отдельными source-checkers;
- `leader-public-lead v10` активна;
- browser E2E подготовлен, но не выполнен без отдельного разрешения владельца;
- доказана только цепочка `accepted`; остальные audit outcomes остаются открытыми в issue #206;
- реальные материалы портфолио и полный NAP ожидаются в issues #235 и #236;
- production Supabase не менялся.

## Исторические CI guard markers

Этот блок сохраняет точные исторические формулировки, которые используются действующими workflow документации. Он не отменяет актуальный статус 2026-07-13.

- Исторический checkpoint: Дата обновления: 2026-06-28.
- Быстрый путь: Открыть доступ CRM через `?tab=user_admin`; раздел называется `Доступ и роли`.
- Историческая сводка: active access admins (`owner` + `admin`): 3; inactive profiles: 0.
- Проверка публичной цепочки: `Проверить request_id` и получить статус `Цепочка полная`.
- Request UI marker: `20260628-clarity-2`; пользователь видит блок `Выберите похожую задачу`.
- Этап расширения Open Graph 2026-06-28.
- Контрольные страницы: `srochnaya-reklama-borisoglebsk.html`, `reklama-dlya-servisa-masterskoy-borisoglebsk.html`, `tablichki-borisoglebsk.html`, `oformlenie-vitrin-borisoglebsk.html`, `pechat-na-plenke-borisoglebsk.html`.
- Исторический статус пакета: первые два пакета из 8 страниц услуг уже закрыты.
- CRM access cache marker: `20260628-access-label-1`.
