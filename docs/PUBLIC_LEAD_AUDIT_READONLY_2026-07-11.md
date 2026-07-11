# Read-only состояние аудита публичных заявок — 2026-07-11

Контур:

`сайт → leader-public-lead → leader_leads → leader_public_lead_audit → CRM`

Проверка выполнена только чтением. Персональные поля, телефоны, имена и тексты заявок не выгружались.

## Live-функция

- `leader-public-lead v9`;
- статус `ACTIVE`;
- `verify_jwt=false`, как и требуется для публичной формы;
- deploy и изменение переменных окружения не выполнялись.

## Фактическая схема аудита

Ключевые поля таблицы `public.leader_public_lead_audit`:

- `request_id`;
- `phone_normalized`;
- `source_page_path`;
- `page_url`;
- `user_agent`;
- `referer`;
- `utm_source`, `utm_medium`, `utm_campaign`;
- `result`;
- `reason`;
- `payload`.

Событие определяется парой `result` + `reason`. Поля `event_type` в live-схеме нет.

## Агрегированный результат

На момент проверки в таблице есть одно событие:

- `result = accepted`;
- `reason = lead_insert_created`;
- количество: `1`;
- время: `2026-06-28 10:32:49 UTC`.

В данных пока нет подтверждённых событий:

- `duplicate / request_id_conflict`;
- `suspicious / honeypot_filled`;
- `rejected / phone_or_message_required`;
- `error / insert_failed`.

Это не означает, что ветки кода отсутствуют. Они присутствуют в source-контракте, но требуют отдельного контролируемого browser/API evidence без создания лишних production-заявок.

## Граница изменений

- SQL выполнялся только на чтение и агрегацию;
- DDL, DML, RLS, grants и данные не менялись;
- Edge Functions не развёртывались;
- Auth и Storage не менялись;
- `nav_*` не затрагивались.
