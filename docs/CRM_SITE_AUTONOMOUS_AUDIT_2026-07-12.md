# РА «Лидер»: всесторонний аудит сайта, CRM и автономный план улучшений — 2026-07-12

Репозиторий: `deputat36/lider-bsk`.

Supabase project: `ofewxuqfjhamgerwzull`.

Контур: публичный сайт РА «Лидер», CRM v4 и объекты `leader_*`. Объекты `nav_*`, Parket и Broker не входят в работу.

Режим аудита:

- GitHub source inspection и source-only изменения в отдельной ветке;
- read-only SQL, policies, grants, advisors, logs и Edge Function inspection в Supabase;
- production Supabase не изменялся;
- Edge Functions не разворачивались;
- DDL/DML, Auth, RLS, grants, indexes и данные не менялись.

## 1. Executive summary

Система уже является сильным ранним production-контуром, а не простым сайтом-визиткой. Публичный сайт собирает обращения и передаёт их в CRM; CRM покрывает потребность, расчёт, КП, заказ, производство, монтаж и финансы. Основной разрыв теперь не в количестве экранов, а в управляемости:

1. Публичный intake можно обойти прямой записью через Data API, потому что Edge Function использует anon key и в production сохранены публичные INSERT grant/policy.
2. Live Edge Functions проверяют JWT и активный профиль, но не проверяют роль на конкретное service-role действие.
3. `anon` формально имеет широкие table grants на значительную часть `leader_*`; RLS сейчас блокирует внутренние данные, но принцип минимальных прав не соблюдён.
4. Все семь активных лидов не назначены сотруднику, две активные заявки не имеют следующего контакта, девять потребностей заполнены менее чем на 80%.
5. Расходы и дизайн-задачи фактически не используются, поэтому CRM пока не показывает полную фактическую прибыль и не управляет дизайном как отдельным процессом.
6. Клиентская часть имеет хорошую SEO-базу, много посадочных страниц, понятную заявку и request trace, но требует единого page registry, consent versioning, более строгого payload contract и браузерного доказательства производительности/доступности.

Рабочая оценка зрелости: **6,2/10**. Это не внешний рейтинг, а внутренняя оценка готовности системы стать обязательным рабочим контуром агентства.

## 2. Целевая архитектура

Клиентский контур:

`поисковая/рекламная страница → понятная услуга или сценарий → заявка → request_id → подтверждение клиенту`.

Сотруднический контур:

`новая заявка → ответственный → следующий контакт → потребность → расчёт → КП → заказ → дизайн → производство → монтаж → оплаты → расходы → фактическая прибыль → повторный контакт`.

Принцип разделения:

- публичный сайт не должен иметь прямой доступ к бизнес-таблицам;
- сотрудник входит через Supabase Auth;
- активный профиль подтверждает допуск;
- canonical permission подтверждает каждое действие;
- сложные write-команды выполняются через versioned Edge/RPC contract;
- безопасные reads могут оставаться под RLS;
- все важные переходы оставляют audit event.

## 3. Точный production snapshot

Read-only `COUNT(*)` на 2026-07-12:

| Сущность | Строк |
|---|---:|
| Лиды | 12 |
| Клиенты | 10 |
| Потребности | 14 |
| Расчёты | 10 |
| Позиции расчётов | 28 |
| Коммерческие предложения | 8 |
| Заказы | 5 |
| Позиции заказов | 14 |
| Платежи | 3 |
| Расходы | 0 |
| Дизайн-задачи | 0 |
| Производственные задания | 2 |
| Монтажные задания | 1 |
| Профили пользователей | 4 |
| Роли | 7 |
| Public lead audit events | 1 |

Операционное качество:

- активных лидов: 7;
- активных лидов без ответственного: 7;
- активных лидов без следующего контакта: 2;
- потребностей с completeness score ниже 80: 9;
- позиций расчёта без `catalog_id`: 28;
- заказов без расходов: 5.

Большая часть исторических строк была создана до текущих request/catalog contracts. Автоматический backfill без отдельного решения не выполняется.

## 4. Аудит публичного сайта

### Сильные стороны

- корректные title, description, canonical, robots, Open Graph и Twitter metadata;
- LocalBusiness, WebSite, WebPage и Breadcrumb structured data;
- `robots.txt` закрывает CRM и внутренние navigator paths;
- sitemap содержит широкую семантику услуг и локальных сценариев;
- общая форма подключается к посадочным страницам и использует page/service presets;
- сохраняются UTM, URL, page path, title, source, contact preference и подробности задачи;
- stable `request_id` переживает повторную попытку после сетевого сбоя;
- клиент получает номер обращения и корректное сообщение о duplicate;
- мобильный sticky CTA и события Яндекс Метрики поддерживают конверсию.

### Недостатки и риски

- часть страниц содержит большой inline CSS, что осложняет поддержку, кеширование и системное обновление дизайна;
- sitemap, page presets, canonical URLs и список посадочных страниц поддерживаются раздельно и могут расходиться;
- client-side требует телефон, а server-side принимает телефон или message;
- budget хранится как label внутри payload, а числовое поле лида не заполняется;
- structured fields дублируются в human-readable message;
- consent отображается текстом без явной ссылки и contract/version marker;
- Webvisor требует отдельной проверки политики и объёма собираемых персональных данных;
- нет автоматического browser proof для формы, duplicate, honeypot и полной request chain;
- live visual/Core Web Vitals проверка в этом проходе не доказана: встроенный web fetch не получил страницы, поэтому производительность нельзя оценивать только по исходникам.

## 5. Аудит связки сайт → CRM

### Работает

- сайт отправляет заявку в `leader-public-lead`;
- Edge Function нормализует телефон, проверяет origin/method/payload, honeypot и request id;
- лид и audit event связаны request id;
- CRM имеет request trace и может показать полноту цепочки;
- повторный identical request не должен создавать второй лид.

### Критический P0: прямой Data API insert

Live `leader-public-lead v9` использует `SUPABASE_ANON_KEY` для записи в:

- `leader_leads`;
- `leader_public_lead_audit`.

Production содержит:

- anon INSERT grant на обе таблицы;
- public INSERT policy на обе таблицы.

Технический клиент может отправить REST insert напрямую, минуя Edge origin allowlist, honeypot, нормализацию и единый audit contract.

Исправление должно быть координированным:

1. Перевести Edge Function на service role.
2. Проверить accepted/duplicate/suspicious/rejected на development branch.
3. Одновременно отозвать anon INSERT grants и удалить public INSERT policies.
4. Добавить abuse/rate limit.
5. Провести browser E2E и rollback proof.

Нельзя разносить эти шаги по production-деплоям: можно либо остановить заявки, либо оставить обход.

### Дополнительный security finding: широкие anon grants

Read-only inspection показал, что `anon` формально имеет широкие grants (`SELECT/INSERT/UPDATE/DELETE`, а для ряда таблиц также `TRUNCATE/TRIGGER/REFERENCES`) на значительную часть внутренних `leader_*` таблиц.

Сейчас это не означает открытое чтение или изменение данных: на внутренних таблицах нет anon policies и RLS блокирует строки. Но это нарушает least privilege и повышает последствия будущей ошибки RLS.

Целевое состояние:

- anon имеет доступ только к явно публичному API;
- после intake cutover anon не имеет table grants на бизнес-таблицы;
- authenticated получает только необходимые grants;
- privileged writes идут через Edge/RPC;
- default privileges новых объектов становятся opt-in.

## 6. Аудит CRM для сотрудников

### Сильные стороны

- profile-first boot уже реализован в GitHub source: workspace скрыт и `crmReady=false`, пока активный профиль не подтверждён;
- имеются модули заявок, потребностей, расчётов, КП, заказов, дизайна, производства, монтажа, финансов, доступа и диагностики;
- основные бизнес-сущности связаны внешними ключами;
- order-from-offer имеет transaction-backed RPC;
- status registry и source checks уже развиваются;
- семь ролей заведены в production: owner, admin, manager, accountant, designer, installer, contractor.

### Критический P0: action-level RBAC не развёрнут

Live `leader-crm-leads v12` и `leader-crm-orders v2`:

- проверяют JWT;
- проверяют активный профиль;
- затем используют service role;
- не проверяют canonical permission для конкретного action.

Следствие: активный профиль является слишком широким допуском. Роль должна проверяться до любого service-role REST/RPC вызова, а ответы должны иметь role-specific field projection.

### Два backend-контура

CRM v4 одновременно использует:

1. direct Supabase client + RLS;
2. service-role Edge Functions.

Без единого contract registry это приводит к расхождению валидации, permissions, audit и source metadata. Целевой принцип:

- безопасные reads — RLS;
- privileged/transactional writes — versioned Edge/RPC actions;
- один declarative registry связывает action, permission, payload, result и audit event.

### Операционные разрывы

- 7 из 7 активных лидов без ответственного;
- 2 активных лида без следующего контакта;
- 9 из 14 потребностей заполнены менее чем на 80%;
- 0 расходов при 5 заказах;
- 0 дизайн-задач;
- 28 расчётных позиций без catalog trace;
- planned profit присутствует, actual profit не доказан.

CRM должна стать не справочником, а обязательным процессом с gates, SLA и очередями качества.

## 7. Приоритеты

### P0 — безопасность и доказательство цепочки

1. Server-side RBAC для `leader-crm-leads` и `leader-crm-orders`.
2. Role-specific response projections.
3. Coordinated public intake service-role cutover.
4. Revoke broad anon grants и public insert policies после успешного cutover.
5. Browser proof: accepted, retry, duplicate, honeypot, request trace, inactive profile, negative role actions.

### P1 — обязательный рабочий процесс

1. Ответственный и следующий контакт для каждого активного лида.
2. SLA первого контакта и просроченные очереди.
3. Completeness gate перед расчётом и КП.
4. Единый transactional backend write contract.
5. Автоматическая/ручная design task при `need_design=true`.
6. Подтверждаемые платежи и расходы.
7. Planned profit отдельно от actual profit.
8. Catalog trace от расчёта до заказа.

### P2 — клиентский сайт и аналитика

1. Formal `PublicLeadPayload v1`.
2. Consent link, consent version и data-minimization review.
3. Единый page registry для sitemap, canonical, presets, breadcrumbs и form coverage.
4. Health dashboard `site → Edge → audit → lead → CRM`.
5. Нормализованная source/UTM taxonomy.
6. Core Web Vitals, accessibility и mobile browser evidence.
7. Контентные улучшения на основании реальных поисковых и CRM-конверсий.

### P3 — зрелость и сопровождение

1. Consolidate overlapping docs/checkers/workflows.
2. Удалить legacy `crm_v2` markers после совместимого перехода.
3. Управляемые release notes, rollback и deployed SHA evidence.
4. Регулярный advisor review.
5. Индексы пересматривать только после появления стабильной статистики трафика.

## 8. Автономный режим работы

Без участия владельца можно автономно:

- читать GitHub и Supabase в read-only режиме;
- проводить source/data-quality/security audit;
- создавать issues, branches, source changes, tests, docs и draft PR;
- исправлять безопасные frontend/CRM source defects;
- усиливать CI, validators и contract checks;
- поддерживать master roadmap и evidence;
- выбирать следующую небольшую задачу по P0 → P1 → P2;
- не создавать демо-данные и не переписывать business data.

Требует отдельного явного approval:

- production Edge deploy;
- Supabase DDL/DML;
- RLS/policies/grants/default privileges;
- Auth settings;
- indexes;
- data backfill;
- создание платной Supabase development branch после подтверждения стоимости;
- merge/deploy изменений с высоким blast radius.

## 9. Порядок автономных итераций

Каждая итерация:

1. Проверить main, open issues/PR, CI и текущий production read-only snapshot.
2. Выбрать одну небольшую задачу с максимальным снижением риска или улучшением бизнес-пути.
3. Создать отдельную branch.
4. Изменить source, tests/checkers и документацию.
5. Открыть draft PR с scope, acceptance, rollback и production status.
6. Исправить CI до зелёного состояния.
7. Обновить master issue #200.
8. Не merge/deploy approval-gated изменения автоматически.
9. После merge перейти к следующему незакрытому acceptance criterion.

## 10. Работа, начатая в этом проходе

Branch: `fix/order-edge-rbac-v2`.

Изменён source-кандидат `supabase/functions/leader-crm-orders/index.ts`:

- canonical roles ограничены семью live ролями;
- удалена несуществующая разрешающая роль `production`;
- owner/admin имеют полный утверждённый доступ;
- manager не может менять `payment_status`;
- accountant может читать finance projection и менять только `payment_status`;
- designer/installer/contractor не используют generic order service-role endpoint;
- неизвестная роль fail closed;
- пустой update возвращает `400 no_update_fields`;
- проверка каждого update field выполняется до PATCH;
- manager response исключает `contractor_cost` и `profit`;
- accountant response исключает производственные и дизайн-поля.

Усилены:

- `tools/check_supabase_edge_function_sources.py`;
- `tools/check_crm_server_action_rbac_spec.py`.

Production не изменён. Live Edge Function остаётся `leader-crm-orders v2` до development tests и отдельного approval.

## 11. Следующие source-only задачи

1. Открыть draft PR и пройти CI для order RBAC candidate.
2. Реализовать canonical action registry в GitHub source `leader-crm-leads`.
3. Добавить role-specific projections для leads/orders dashboard actions.
4. Подготовить public intake service-role source candidate и coordinated SQL migration, не применяя их.
5. Добавить consent link/version в public form contract.
6. Создать page registry validator для sitemap/canonical/preset/form coverage.
7. Добавить read-only operational quality dashboard: unassigned, missing next contact, low completeness, missing expenses/design tasks.

## 12. Definition of done

Система считается зрелой, когда:

- публичная заявка создаётся только через контролируемый endpoint;
- request id и audit outcome есть у каждого нового обращения;
- inactive profile не получает CRM-ready;
- каждое privileged action проверяет canonical permission server-side;
- UI tabs и server permissions согласованы;
- restricted role не получает лишние поля;
- каждый активный лид имеет ответственного и следующую задачу;
- потребность достаточно заполнена до расчёта/КП;
- design, production и installation имеют явные task/status workflows;
- planned и actual profit разделены;
- сайт и CRM имеют browser/manual evidence и автоматические source checks;
- production state подтверждён deployed SHA, migrations и rollback evidence.
