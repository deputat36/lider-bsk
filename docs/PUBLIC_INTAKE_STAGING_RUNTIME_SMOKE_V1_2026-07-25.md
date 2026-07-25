# Public intake staging runtime smoke v1 — 2026-07-25

Статус: passed. Production не изменён.

## Что проверено фактически

На staging-проекте `otulfnouybahfnsycxqn` подготовлен защищённый контур публичных заявок:

- создан отсутствовавший audit-контракт;
- добавлена уникальность `request_id`;
- `anon` не имеет прямого INSERT в заявки и audit;
- активный authenticated-профиль может создать ручную заявку через RLS-policy;
- service role может писать заявки и audit;
- rate-limit RPC доступна только service role;
- исходный IP не сохраняется и не попадает в audit.

## Runtime-сценарий

Внешний клиент GitHub Actions выполнил реальные POST-запросы к staging Edge Function:

1. Корректная заявка — HTTP 200, лид создан.
2. Повтор с тем же `request_id` — HTTP 200 с `duplicate=true`, второй лид не создан.
3. Пустые телефон и сообщение — HTTP 400 `phone_or_message_required`.
4. Заполненный honeypot — безопасный HTTP 200, лид не создан.
5. Первые пять заявок с одним телефоном — HTTP 200.
6. Шестая заявка с тем же телефоном — HTTP 429 с `retry_after_seconds`.

Независимая сверка базы до очистки показала:

- 6 допустимых лидов;
- 10 audit-записей;
- 8 rate-limit receipts;
- один лид для пары original + duplicate;
- 0 лидов для validation, honeypot и rate-limited попытки.

Audit-разбивка:

- 6 × `accepted / lead_insert_created`;
- 1 × `duplicate / request_id_conflict`;
- 1 × `rejected / phone_or_message_required`;
- 1 × `rejected / rate_limit_phone`;
- 1 × `suspicious / honeypot_filled`.

## Ручное создание заявки CRM

В транзакционном smoke создан временный активный профиль, установлен authenticated JWT context и выполнен INSERT через реальную RLS-policy `leader_leads_insert_app`. Вставка прошла. Лид и профиль удалены в той же проверке.

## Автоочистка

После runtime-smoke cleanup-функция удалила ровно:

- 6 лидов;
- 10 audit-записей;
- 8 rate-limit receipts.

Повторная очистка вернула нули по всем трём типам данных. Дополнительная SQL-проверка также подтвердила нулевой остаток.

## Безопасность

Security Advisor не обнаружил критических или warning-проблем. Информационные уведомления `RLS enabled no policy` для service-only таблиц ожидаемы: у `anon` и `authenticated` отозваны права, доступ идёт только через service role.

Performance Advisor показал только ранее существовавшие неиспользованные индексы, не связанные с public intake.

## Граница production

Production по-прежнему использует прежнюю Edge Function и публичные INSERT-policy. Rate-limit таблица и RPC в production не создавались. Production cutover остаётся отдельным действием с обязательным rollback и синтетической проверкой.
