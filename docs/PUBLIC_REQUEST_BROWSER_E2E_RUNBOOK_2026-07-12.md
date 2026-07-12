# Browser E2E публичной заявки — 2026-07-12

Контур: публичный сайт РА «Лидер» → `leader-public-lead` → `leader_leads` → `leader_public_lead_audit`.

Связано: #142, #200.

## Статус

Runbook подготовлен, но production E2E ещё не выполнен.

Не выполнять отправку без явного подтверждения владельца. Даже тестовая форма создаёт production-запись в `leader_leads` и audit-событие. В рамках подготовки этого документа заявки не отправлялись, данные не изменялись.

## Что нужно доказать

Минимальный E2E должен подтвердить всю цепочку:

1. опубликованная страница отображает форму;
2. браузер отправляет POST в `leader-public-lead`;
3. функция возвращает HTTP 200, `ok=true` и `request_id`;
4. интерфейс показывает тот же номер обращения;
5. в `leader_leads` существует ровно одна строка с этим `request_id`;
6. `source_page_path`, URL, UTM и версия согласия сохранены;
7. в `leader_public_lead_audit` записано `accepted / lead_insert_created`;
8. никакие клиентские или рабочие данные не используются как тестовые.

## Подготовка

Перед тестом:

- получить явное разрешение владельца на одну production-заявку;
- использовать номер телефона, принадлежащий самому проверяющему или специально разрешённый для теста;
- не указывать имя, телефон или данные реального клиента;
- создать уникальный текстовый маркер, например `E2E-PUBLIC-20260712-193500`;
- открыть DevTools → Network и включить сохранение запросов;
- записать время начала теста по UTC;
- не запускать тест параллельно в нескольких вкладках.

Рекомендуемый URL:

```text
https://www.lider-bsk.ru/request.html?utm_source=manual_e2e&utm_medium=browser&utm_campaign=public_request_chain_20260712&utm_content=request_page
```

## Минимальный сценарий

1. Открыть URL из runbook в обычном браузере.
2. Убедиться, что форма содержит телефон, услугу, описание задачи и ссылку на `privacy.html`.
3. Заполнить:
   - имя: `Тест публичной формы`;
   - телефон: только разрешённый тестовый номер;
   - услуга: `Другое`;
   - описание: уникальный маркер `E2E-PUBLIC-...` и фраза `Контролируемая проверка публичной формы`.
4. Нажать `Отправить заявку` один раз.
5. Зафиксировать:
   - URL POST-запроса;
   - HTTP status;
   - JSON response;
   - отображённый в форме номер обращения;
   - время ответа;
   - screenshot только без лишних персональных данных.

Ожидаемый endpoint:

```text
https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead
```

Ожидаемый ответ:

```json
{
  "ok": true,
  "request_id": "web-..."
}
```

`duplicate` в минимальном сценарии должен отсутствовать или быть `false`.

## Read-only проверка `leader_leads`

Подставить фактический номер обращения вместо `<REQUEST_ID>`.

```sql
select
  id,
  request_id,
  name,
  phone_normalized,
  source,
  service,
  status,
  source_page_path,
  page_url,
  submitted_at,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  payload ->> 'consent_version' as consent_version,
  payload ->> 'page_title' as page_title,
  payload ->> 'form' as form_version
from public.leader_leads
where request_id = '<REQUEST_ID>';
```

Ожидается ровно одна строка:

- `source = 'Сайт'`;
- `status = 'Новая'`;
- `source_page_path = '/request.html'`;
- `utm_source = 'manual_e2e'`;
- `utm_medium = 'browser'`;
- `utm_campaign = 'public_request_chain_20260712'`;
- `utm_content = 'request_page'`;
- `consent_version = 'privacy-2026-07-12-v1'`;
- `form_version = 'site_public_form_v7'`.

Проверка количества:

```sql
select count(*)::int as lead_rows
from public.leader_leads
where request_id = '<REQUEST_ID>';
```

Ожидается `lead_rows = 1`.

## Read-only проверка audit

```sql
select
  id,
  created_at,
  request_id,
  phone_normalized,
  source_page_path,
  page_url,
  referer,
  utm_source,
  utm_medium,
  utm_campaign,
  result,
  reason,
  payload
from public.leader_public_lead_audit
where request_id = '<REQUEST_ID>'
order by created_at asc;
```

Для минимального сценария ожидается событие:

- `result = 'accepted'`;
- `reason = 'lead_insert_created'`;
- `source_page_path = '/request.html'`;
- UTM совпадают с URL теста.

## Проверка Edge logs

В логах `edge-function` найти запрос по времени теста:

- функция `leader-public-lead`;
- метод POST;
- HTTP 200;
- версия функции 10.

Отсутствие подробного console-log при успешной отправке не является ошибкой: основным доказательством служат response, `leader_leads` и audit.

## Опциональная проверка idempotency

Не выполнять без отдельного явного разрешения владельца.

Повторная отправка формы после успешного ответа обычно создаёт новый `request_id`, потому что pending reference очищается. Для проверки duplicate-contract нужно повторить именно захваченный POST body с тем же `request_id`.

Ожидаемый повторный ответ:

```json
{
  "ok": true,
  "request_id": "<REQUEST_ID>",
  "duplicate": true
}
```

После повторного POST:

- количество строк в `leader_leads` по `request_id` остаётся 1;
- в audit появляется дополнительное событие:
  - `result = 'duplicate'`;
  - `reason = 'request_id_conflict'`.

## Критерии PASS

Тест считается успешным только если одновременно выполнены условия:

- браузер получил HTTP 200 и `ok=true`;
- UI показал тот же `request_id`;
- в `leader_leads` ровно одна строка;
- `source_page_path`, UTM, consent и form version корректны;
- audit содержит `accepted / lead_insert_created`;
- нет 4xx/5xx для основной отправки;
- тест не использовал данные реального клиента.

## Критерии FAIL

Зафиксировать FAIL и не повторять отправку автоматически, если:

- форма не отображается;
- POST не уходит или блокируется CORS;
- response не содержит `request_id`;
- UI показывает другой номер обращения;
- строка в `leader_leads` отсутствует или дублируется;
- `source_page_path`, UTM или consent потеряны;
- audit не содержит `accepted`;
- получен `insert_failed`, `origin_not_allowed` или другой 4xx/5xx.

## Фиксация результата

После разрешённого теста обновить этот документ или отдельный датированный отчёт:

- точная дата и время UTC;
- опубликованный URL;
- browser и версия;
- `request_id`;
- HTTP status;
- PASS/FAIL каждого критерия;
- ссылки на GitHub issue/PR;
- подтверждение, что использован разрешённый тестовый номер;
- решение владельца о дальнейшей судьбе тестовой записи.

Не удалять и не изменять production-запись через SQL без отдельного явного разрешения владельца. Runbook содержит только read-only SQL.

## Текущая production-база до теста

Read-only snapshot на 2026-07-12:

- `leader-public-lead`: ACTIVE v10, `verify_jwt=false`;
- `leader_leads`: 12 строк;
- с `request_id`: 1;
- с `source_page_path`: 1;
- с заполненным `utm_source`: 6;
- последняя заявка: 2026-06-28 10:32:31 UTC.

CRM UI, `nav_*`, Supabase schema, RLS, grants, Auth и Edge Function этим runbook не изменяются.
