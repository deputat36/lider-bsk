# CRM v4: локальный preview черновика дизайн-задачи

Дата: 2026-07-13.

## Цель

Проверить безопасный source-only этап issue #226:

`заказ / потребность → локальный preview черновика design task`

Этап не создаёт `leader_design_tasks`, события, комментарии или общие задачи. Он показывает минимальный будущий payload и оставляет production-кнопку отключённой до отдельного server-side approval.

## Реализованный контур

- чистая модель: `crm/v4/assets/v4/design-task-draft-model-v1.js`;
- read-only modal preview: `crm/v4/assets/v4/design-task-draft-preview-v1.js`;
- точки входа из очереди и карточки заказа: `crm/v4/assets/v4/design-task-draft-entrypoints-v1.js`;
- подключение: `crm/v4/assets/v4/site-cache-note-v1.js`;
- behavior test: `tools/test_design_task_draft.mjs`;
- source checker: `tools/check_design_task_draft_preview.py`;
- workflow: `.github/workflows/crm-design-task-draft-check.yml`.

## Live Supabase evidence

Read-only проверка проекта `ofewxuqfjhamgerwzull` показала:

- проект имеет статус `ACTIVE_HEALTHY`;
- активных неархивных заказов — 5;
- заказов, связанных с активной потребностью `need_design=true`, — 2;
- связанных с заказами design tasks — 0;
- очередь `Нужен дизайн, задачи нет` содержит 2 заказа;
- всего потребностей `need_design=true` — 4;
- одна design-потребность имеет полноту ниже 80%;
- одна design-потребность не имеет `deadline_date`;
- у design-потребностей заполнено поле `design_reason`;
- `leader_design_tasks` — 0 строк;
- `leader_design_task_events` — 0 строк;
- `leader_design_task_comments` — 0 строк.

Проверка выполнялась агрегатно, без имён клиентов, телефонов, комментариев, финансовых сумм и содержимого ТЗ.

## Минимальные read-only запросы preview

### `leader_orders`

```text
id,order_number,lead_id,project_name,status,priority,deadline,layout_status,layout_link,is_archived
```

### `leader_lead_needs`

```text
id,lead_id,need_type,title,need_design,design_reason,deadline_date,status,completeness_score
```

### `leader_design_tasks`

```text
id,order_id,task_status,layout_status,designer_name,deadline,layout_link,created_at
```

Не запрашиваются:

- `client_name`;
- `client_phone`;
- `client_total`;
- `contractor_cost`;
- `profit`;
- оплаты и расходы;
- внутренние комментарии заказа;
- клиентские и внутренние комментарии design task;
- тексты событий и комментариев.

## Состояния preview

### `draft_ready`

Есть активная потребность `need_design=true`, активной design task по заказу нет, необходимые сведения заполнены.

### `draft_incomplete`

Черновик сформирован, но присутствует хотя бы одно предупреждение:

- нет дедлайна;
- не заполнена причина дизайна;
- полнота потребности ниже 80%;
- в заказе уже есть ссылка на макет;
- у роли нет `design.write`.

### `existing_active_task`

По заказу найдена активная design task. Новый draft не формируется.

Неизвестный raw-статус задачи сохраняется без автоматического сопоставления или перезаписи.

### `design_not_proven`

В активных потребностях заказа нет подтверждения `need_design=true`.

### `order_unavailable`

Заказ архивный либо имеет терминальный canonical статус.

### `access_denied`

У текущей роли нет `design.read`.

## Безопасный command envelope

Preview формирует локальный объект будущей команды:

```text
design_task.create_from_order
```

В него входят:

- `order_id`;
- пустой `production_job_id`;
- детерминированный `idempotency_key`;
- заголовок задачи;
- начальный canonical статус `Новая`;
- текущий live default макета `Макет не начат`;
- приоритет;
- дедлайн с указанием источника;
- краткое ТЗ из design-потребности;
- ids потребностей, доказавших `need_design=true`.

В него не входят персональные и финансовые поля.

## Canonical flow

Начальный статус design task берётся из `status-transitions-v1.js`:

```text
Новая → В работе / Отменено
```

Дальнейшая canonical цепочка:

```text
Новая → В работе → На согласовании → На доработке → Согласовано → Завершено
```

Доступные переходы определяются registry, а не локальным дублирующим списком.

## Browser checklist

### Подготовка

1. Открыть `https://deputat36.github.io/lider-bsk/crm/v4/`.
2. Выполнить `Ctrl + F5`.
3. Войти под активной ролью `owner`, `admin` или `manager`.
4. Открыть DevTools → Network.
5. Включить фильтр Fetch/XHR.
6. Очистить журнал запросов.

### Проверка очереди

1. Открыть вкладку `Контроль заказов`.
2. Найти блок `Операционное качество заказов`.
3. Открыть очередь `Нужен дизайн, задачи нет`.
4. Убедиться, что у строк появился action `Подготовить черновик design task`.
5. Нажать action.
6. Убедиться, что поверх очереди открылось окно `Черновик дизайн-задачи`.
7. Проверить состояние `Черновик подготовлен` либо `Черновик требует уточнений`.
8. Убедиться, что очередь остаётся read-only и не исчезает после закрытия preview.

### Проверка карточки заказа

1. Открыть заказ из любой штатной очереди кнопкой `Открыть заказ`.
2. Найти секцию `Дизайн в заказе`.
3. Убедиться, что появилась кнопка `Проверить дизайн-задачу`.
4. Открыть preview.
5. Проверить, что используется тот же `order_id`, что и у открытого заказа.
6. Закрыть preview и убедиться, что карточка заказа остаётся открытой.

### Проверка содержимого

1. Проверить номер заказа и canonical статус.
2. Проверить приоритет и срок заказа.
3. Проверить design-потребность, её полноту, причину и срок.
4. Убедиться, что показан canonical flow design task.
5. Проверить JSON command envelope.
6. Убедиться, что JSON не содержит:
   - имени клиента;
   - телефона;
   - суммы клиенту;
   - себестоимости;
   - прибыли;
   - оплат и расходов;
   - внутренних комментариев.
7. Нажать `Скопировать JSON`.
8. Вставить JSON в локальный текстовый редактор и повторно проверить состав полей.
9. Убедиться, что кнопка `Создать задачу в CRM — отключено` disabled.

### Проверка существующей задачи

Live design tasks сейчас отсутствуют. Не создавать production-строку ради теста.

Состояния существующей и неизвестной задачи покрыты behavior test:

- известная активная задача блокирует новый draft;
- неизвестный raw-статус сохраняется как есть;
- завершённая задача считается терминальной и не маскируется под активную.

### Responsive

Проверить ширины:

- 1280 px;
- 768 px;
- 390 px.

На 390 px:

- заголовок не выходит за экран;
- кнопки занимают доступную ширину;
- JSON переносится внутри блока;
- modal прокручивается;
- нижние действия доступны.

## Network checklist

При открытии preview допустимы только read-only GET/SELECT к:

- `leader_orders`;
- `leader_lead_needs`;
- `leader_design_tasks`.

При копировании JSON, закрытии modal и просмотре canonical flow не должно быть новых Fetch/XHR.

Недопустимы:

- POST;
- PATCH;
- PUT;
- DELETE;
- RPC;
- вызов Edge Function создания design task;
- INSERT в `leader_design_tasks`;
- INSERT в `leader_design_task_events`;
- INSERT в `leader_design_task_comments`;
- INSERT в `leader_tasks`;
- изменение заказа или потребности.

## Production boundary

В рамках этапа запрещены и не выполняются:

- DDL/DML;
- migrations;
- RLS/grants/policies;
- Edge/RPC deploy;
- Auth и Storage;
- backfill;
- создание демонстрационных production-задач;
- автоматическое назначение дизайнера;
- автоматическое изменение статуса заказа или макета;
- автоматическая передача в производство.

## Approval gates

Отдельное разрешение требуется для:

- реализации `design_task.create_from_order`;
- server-side проверки `design.write`;
- idempotency storage/constraint;
- INSERT в `leader_design_tasks`;
- создания audit event;
- автоматического назначения дизайнера;
- блокировки передачи в производство;
- backfill задач для двух текущих заказов;
- изменений схемы, RLS, grants, RPC или Edge Functions.

Source-only staging transport и оставшиеся Auth/read-path gates описаны в `docs/CRM_DESIGN_TASK_STAGING_TRANSPORT_RUNBOOK_2026-07-14.md`. В текущей production CRM кнопка по-прежнему должна показывать `Создать задачу в CRM — отключено`.
