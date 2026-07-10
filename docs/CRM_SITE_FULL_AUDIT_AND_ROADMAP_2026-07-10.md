# Полный аудит CRM и связки с сайтом РА «Лидер» — 2026-07-10

Репозиторий: `deputat36/lider-bsk`.

Supabase project: `ofewxuqfjhamgerwzull`.

Контур аудита: только сайт и CRM РА «Лидер», объекты `leader_*`.

Режим: GitHub source changes и read-only Supabase inspection. Production Supabase в рамках аудита не изменялся.

## 1. Цель системы

Целевой бизнес-путь:

`сайт → заявка → ответственный → потребность → расчёт → КП → заказ → дизайн → производство → монтаж → оплата → расходы → прибыль → повторный контакт`.

CRM v4 уже содержит значительную часть этого пути, но пока работает как набор сильных функциональных модулей без полностью единого backend-контракта и без сквозного server-side RBAC.

## 2. Текущая архитектура

### Публичный сайт

Общий браузерный модуль:

- `assets/public-lead-form.js`;
- публичный endpoint: `leader-public-lead`;
- дополнительные поля, UTM, page URL/path, user agent, honeypot и `request_id`;
- Яндекс Метрика и события `leader:goal`;
- основная страница заявки: `request.html`.

### Публичный Edge Function

Live baseline:

- `leader-public-lead` — ACTIVE v9, `verify_jwt=false`;
- разрешённые origins: `https://www.lider-bsk.ru`, `https://lider-bsk.ru`;
- ограничения метода и размера payload;
- phone normalization;
- honeypot;
- accepted / duplicate / suspicious / rejected / error audit contract;
- уникальный `request_id` для защиты от повторной записи.

### CRM v4

Основная точка входа:

`https://deputat36.github.io/lider-bsk/crm/v4/`

Фактически используются:

- заявки и карточка заявки;
- потребности;
- расчёты и позиции расчётов;
- коммерческие предложения;
- заказы и позиции заказов;
- контроль заказов;
- производство;
- монтаж;
- финансы;
- аудит публичных заявок;
- доступ и роли;
- диагностика;
- lead analytics badges, summary и derived search.

### Два backend-контура CRM

Сейчас существуют два параллельных способа работы:

1. CRM v4 напрямую обращается к `leader_*` таблицам через Supabase client и RLS.
2. `leader-crm-leads` использует JWT + active profile, а затем выполняет действия через service role.

API logs подтверждают, что текущая CRM v4 реально загружает `leader_leads` напрямую через REST/RLS. Edge Function logs за последние 24 часа пусты.

`leader-crm-leads` при этом сохраняет legacy-маркеры `crm_v2`, `manual://crm-v2` и `source_ui: crm_v2`.

## 3. Сильные стороны

### Связка сайта с CRM

- единая общая форма подключена ко многим посадочным страницам;
- сохраняются UTM, URL, page path, title, referer и client user agent;
- есть `request_id` и audit trail;
- duplicate request не создаёт второй лид при том же `request_id`;
- honeypot фиксирует suspicious event без создания лида;
- CRM имеет поиск и проверку request trace;
- форма показывает пользователю номер обращения.

### Модель данных

Основные этапы воронки связаны внешними ключами:

- lead → need;
- lead → calculation → calculation items;
- lead/calculation → commercial offer → events;
- lead/client/offer → order → order items;
- order → payments / expenses;
- order → production / design / installation.

Каскады и `ON DELETE SET NULL` в целом применены осмысленно.

### Финансовая целостность

Read-only snapshot:

- 5 заказов;
- 0 заказов без lead link;
- 0 заказов без client link;
- 0 расхождений `client_total - contractor_cost = profit`;
- 0 расхождений `client_total - prepayment = balance`;
- 0 позиций заказа без заказа.

### Безопасность базы

- RLS включён на всех проверенных `leader_*` таблицах;
- восемь `leader_*` SECURITY DEFINER-функций не доступны роли `authenticated`;
- `leader-public-lead` ограничивает origins, method и payload;
- `leader-crm-leads` и `leader-crm-orders` требуют JWT;
- production Edge Functions остаются ACTIVE в ожидаемых версиях.

## 4. Подтверждённый snapshot данных

### Воронка

- лидов: 12;
- клиентов: 10;
- потребностей: 14;
- расчётов: 10;
- коммерческих предложений: 8;
- заказов: 5;
- платежей: 3;
- расходов: 0;
- производственных заданий: 2;
- дизайн-задач: 0;
- монтажных заданий: 1.

### Статусы лидов

- `Создан заказ`: 5;
- `Новая`: 3;
- `Расчёт подготовлен`: 2;
- `КП отправлено`: 1;
- `Уточнение деталей`: 1.

### Качество данных

- лидов без телефона и сообщения одновременно: 0;
- лидов без `request_id`: 11;
- лидов с телефоном, но без `phone_normalized`: 10;
- активных лидов без ответственного: 7;
- активных лидов без следующего контакта: 2;
- потребностей с completeness score ниже 80: 9 из 14.

Большая доля строк без `request_id` и `phone_normalized` относится к историческим данным, созданным до текущего public lead contract. Автоматический backfill без отдельного решения не нужен.

## 5. Критические выводы

## P0 — публичный intake можно обойти через прямой REST insert

Live `leader-public-lead` пишет в `leader_leads` и `leader_public_lead_audit` через `SUPABASE_ANON_KEY`.

Для этого в production сохранены:

- `anon INSERT` grant на `leader_leads`;
- `anon INSERT` grant на `leader_public_lead_audit`;
- публичные INSERT policies на обе таблицы.

Следствие: технический клиент может выполнить прямой REST insert, минуя:

- origin allowlist Edge Function;
- honeypot;
- нормализацию телефона;
- обязательную запись audit event;
- единый серверный payload contract.

Это не означает, что база открыта на чтение. Риск относится только к созданию мусорных/неаудированных заявок.

Целевой cutover:

1. Перевести запись внутри `leader-public-lead` на `SUPABASE_SERVICE_ROLE_KEY`.
2. Проверить accepted / duplicate / suspicious / rejected contract на development branch.
3. Одновременно убрать `anon INSERT` grant и public INSERT policy с `leader_leads`.
4. Одновременно убрать `anon INSERT` grant и public INSERT policy с `leader_public_lead_audit`.
5. Добавить rate limit / abuse control.
6. Выполнить browser end-to-end proof.

Нельзя делать шаги 1–4 раздельно в production: это может либо остановить заявки, либо оставить обход.

Статус: требует явного approval и безопасного branch/cutover.

## P0 — роли существуют, но не являются server-side источником истины

`leader_role_permissions` содержит 7 ролей:

- owner;
- admin;
- manager;
- designer;
- installer;
- accountant;
- contractor.

Но:

- CRM v4 menu не читает `allowed_tabs`;
- v4 показывает все разделы любому вошедшему пользователю;
- tab keys в таблице относятся к legacy CRM и не совпадают с v4 keys;
- `leader-crm-leads` проверяет только active profile, но не action permission;
- многие core tables имеют broad `ALL` policy через `leader_private.leader_has_access()`.

Следствие: визуальная роль и фактическая возможность записи расходятся.

Целевое решение:

1. Утвердить canonical permission keys, не только tab names.
2. Создать mapping legacy tabs → CRM v4 tabs.
3. Применять permissions в меню и router.
4. Проверять permission на каждой privileged Edge action.
5. Разделить RLS/RPC write permissions для leads, finance, production, design, installation, catalog и user administration.
6. Добавить negative tests для каждой роли.

До server-side enforcement нельзя масштабировать доступ на дизайнеров, монтажников, подрядчиков и бухгалтерию как на полностью изолированные роли.

## P0/P1 — CRM открывается до подтверждения активного профиля

`auth.js` сейчас:

- устанавливает `crmReady=true` сразу после Supabase Auth session;
- показывает workspace;
- испускает `leader-v4:crm-ready`;
- только затем в фоне читает/создаёт CRM profile.

RLS защищает данные, но возникают:

- лишние запросы до проверки профиля;
- transient errors;
- кратковременное отображение CRM пользователю с pending/inactive profile;
- неоднозначный статус при profile error.

Цель: profile-first boot — `crmReady` и загрузка рабочих данных только после подтверждения active profile.

## P1 — два backend-контракта CRM

Direct RLS и `leader-crm-leads` частично дублируют друг друга.

Риски:

- логика валидации расходится;
- role enforcement можно реализовать в одном контуре и забыть во втором;
- source metadata содержит `crm_v2` в CRM v4;
- диагностика и логи разделены;
- сложнее поддерживать транзакционные действия.

Целевой принцип:

- безопасные reads допускаются через RLS;
- сложные и privileged writes идут через versioned RPC/Edge actions;
- один contract registry описывает action, permission, payload, result и audit event;
- legacy `crm_v2` markers удаляются после совместимого перехода.

## P1 — операционная дисциплина лидов

Snapshot:

- 7 активных лидов не имеют `assigned_to`;
- 2 активных лида не имеют `next_contact_at`;
- 9 из 14 потребностей заполнены менее чем на 80%.

Нужны:

- обязательное назначение ответственного при переводе в работу;
- SLA первого контакта;
- очередь `Без ответственного`;
- очередь `Без следующего контакта`;
- blocking/warning rule перед расчётом и КП при низкой completeness;
- dashboard просрочек.

## P1 — расходы и фактическая прибыль не ведутся

В базе 5 заказов, 3 платежа и 0 расходов.

Текущий `profit` в заказе отражает расчётную маржу `client_total - contractor_cost`, но не обязательно фактическую прибыль после монтажа, доставки, закупок, комиссий и прочих затрат.

Нужны два показателя:

- плановая прибыль;
- фактическая прибыль = подтверждённые входящие платежи - подтверждённые расходы.

Финансовый отчёт не должен смешивать их.

## P1 — дизайн-процесс отображается, но дизайн-задачи не используются

В заказах и производстве есть layout/design statuses, но `leader_design_tasks` содержит 0 строк.

Нужно выбрать единый процесс:

- либо layout state остаётся частью заказа;
- либо для заказа с `need_design=true` автоматически/вручную создаётся полноценная design task.

Рекомендуется второй вариант для роли `designer`, SLA, комментариев, версий и согласования.

## P1 — catalog trace теряется в расчёте

`leader_lead_calculation_items` поддерживает `catalog_id`, но `calcItem(raw, index)` в `calculations.js` не сохраняет `raw.catalog_id`.

Следствие:

- позиция визуально выбрана из каталога, но связь с каталогом теряется;
- сложнее анализировать маржинальность и обновления цен;
- order item trace неполный.

Минимальный source fix уже описан в #156/#169: добавить `catalog_id: raw.catalog_id || null`.

## P1 — retries публичной формы

До этого аудита повторная отправка после сетевого обрыва создавала новый `request_id`.

Исправлено в GitHub source:

- `assets/public-lead-reference-v1.js` сохраняет pending request ID в sessionStorage;
- повтор same-payload submission использует тот же ID;
- duplicate response сохраняет правильный текст;
- request reference CI guard усилен.

Manual browser verification остаётся обязательной.

## P2 — contract формы и сервера не полностью совпадает

- client-side требует телефон;
- server-side принимает телефон или message;
- request page говорит о телефоне и кратком описании;
- budget select сохраняется как label в payload, но numeric `leader_leads.budget` не заполняется;
- подробные поля дублируются в message и payload;
- source хранит UTM/referrer/raw values, из-за чего аналитика требует derived normalization.

Нужно формально описать PublicLeadPayload v1 и разделить:

- raw attribution;
- normalized analytics category;
- human-readable message;
- structured need draft.

## P2 — consent UX

Форма показывает текст согласия на обработку данных, но без явной ссылки на документ и без отдельного consent marker в payload.

Нужно:

- проверить актуальность политики;
- добавить ссылку на неё;
- добавить contract/version marker согласия;
- не собирать лишние персональные данные.

## P2 — observability

- Edge Function logs за последние 24 часа пусты;
- API logs подтверждают прямые CRM reads;
- audit table пока имеет мало live coverage;
- `last_seen_at` профилей не заполняется;
- нет единого health dashboard сайта → Edge → lead → audit → CRM.

Нужно добавить агрегированное наблюдение без хранения лишних персональных данных:

- accepted/duplicate/suspicious/error counts;
- p95 latency;
- request trace completeness;
- leads without assignee/next contact;
- failed privileged actions;
- last successful public submission.

## P2 — статусы не централизованы

Статусы лидов, КП, заказов, производства, дизайна, монтажа и оплаты перечисляются в нескольких JS-модулях и таблицах как text.

Нужен единый status registry в source с:

- canonical key;
- label;
- allowed transitions;
- terminal flag;
- role/action permission;
- timestamps and audit event mapping.

## P3 — документация и CI фрагментированы

Репозиторий содержит много полезных узких docs/checkers/workflows, но текущий статус распределён по датированным файлам.

Решение:

- этот документ становится master audit snapshot;
- создать master issue;
- дочерние issues связывать с P0–P3;
- отдельные dated docs сохранять как evidence, но не как основной backlog;
- постепенно объединять overlapping CI guards без потери покрытия.

## 6. План улучшений

## Этап A — безопасные source-only исправления

Можно выполнять автономно без production Supabase mutations:

1. Retry idempotency public form — выполнено в source.
2. CI guard retry/duplicate contract — выполнено.
3. Master audit, checker и workflow — выполняется.
4. Master GitHub issue и focused issues.
5. Добавить `catalog_id` в calculation item payload.
6. Подготовить profile-first auth patch и tests.
7. Подготовить CRM v4 role/tab mapping helper и tests без включения enforcement.
8. Подготовить public intake cutover plan и static source checks.
9. Добавить data-quality dashboard source layer на read-only aggregates.

## Этап B — manual browser proof

1. Public accepted request.
2. Same request retry after simulated network loss.
3. Duplicate audit event and same request ID.
4. Honeypot suspicious event without lead.
5. Request trace shows `Цепочка полная`.
6. CRM role UI checks.
7. Lead assignment and next-contact workflows.
8. Calculation → offer → order trace.
9. Design / production / installation flow.
10. Payments / expenses / actual profit flow.

## Этап C — approved Supabase hardening

Требует явного approval:

1. Development branch for intake/RBAC changes.
2. Public intake service-role cutover.
3. Revoke anon INSERT and remove public INSERT policies.
4. Rate limit / abuse protection.
5. Canonical action permission model.
6. Edge/RPC action-level authorization.
7. RLS tightening for business roles.
8. Audit events for privileged writes.
9. Migration-history normalization before production DB deploy.
10. Security/performance advisor re-check.

## Этап D — операционная зрелость

1. Mandatory assignee/SLA.
2. Needs completeness gate.
3. Automatic design task workflow.
4. Production and installation acceptance checklists.
5. Payment/expense confirmation workflow.
6. Planned vs actual profit.
7. Repeat-sales tasks and client interaction history.
8. Management dashboard with funnel, deadlines, margin and workload.

## 7. Приоритетная очередь

### P0

- close direct anon intake bypass through coordinated service-role cutover;
- enforce role/action permissions server-side;
- profile-first CRM boot;
- prove public request chain in browser.

### P1

- choose one backend write contract;
- preserve `catalog_id`;
- assign every active lead;
- improve needs completeness;
- implement expenses and actual profit;
- activate design tasks.

### P2

- formal PublicLeadPayload;
- consent versioning;
- observability dashboard;
- centralized status registry;
- source/UTM analytics contract.

### P3

- consolidate documentation and overlapping workflows;
- clean legacy `crm_v2` markers after migration;
- review unused indexes only after stable traffic statistics.

## 8. Acceptance criteria for the improved system

The roadmap is complete when:

- public lead creation is possible only through the controlled endpoint;
- every request has traceable `request_id` and audit outcome;
- no inactive profile emits CRM-ready state;
- every privileged action checks a canonical permission server-side;
- UI tabs match server permissions;
- every active lead has an assignee and next action;
- calculation items preserve catalog trace;
- approved offer creates one linked order transactionally;
- design, production and installation have explicit tasks/statuses;
- planned and actual profit are shown separately;
- all critical paths have browser/manual evidence and automated source checks;
- production changes are represented by normalized migrations and documented deployment evidence.

## 9. Guardrails

During this audit:

- no Supabase DDL was executed;
- no Supabase DML was executed;
- no Edge Function was deployed;
- no RLS policy or grant was changed;
- no Auth setting was changed;
- no index was changed;
- no `nav_*` object was modified;
- historical raw lead values were not rewritten.
