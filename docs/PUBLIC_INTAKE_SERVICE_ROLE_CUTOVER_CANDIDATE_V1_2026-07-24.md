# Public intake service-role cutover candidate v1 — 2026-07-24

Связано с #201 и #206.

Статус: source-only. Production не изменён.

## Подтверждённый live-разрыв

Read-only preflight 24.07.2026 подтвердил:

- `anon` имеет `INSERT` на `public.leader_leads`;
- `anon` имеет `INSERT` на `public.leader_public_lead_audit`;
- обе таблицы имеют публичные INSERT-policy;
- активная production Edge v10 пишет в PostgREST через `SUPABASE_ANON_KEY`;
- `service_role` уже имеет INSERT на обе таблицы;
- ручное создание заявки в CRM использует authenticated direct insert и должно быть сохранено.

## Что подготовлено

1. Edge source использует `SUPABASE_SECRET_KEYS['default']`.
2. Новый `sb_secret_*` передаётся только в `apikey`.
3. Legacy `SUPABASE_SERVICE_ROLE_KEY` остаётся временным fallback и передаётся в `apikey` и `Authorization`.
4. Без backend credential функция отвечает `server_not_configured` и не пытается писать через anon.
5. Privacy-preserving rate limit использует только SHA-256-хеши IP и телефона, без хранения raw IP.
6. Повтор с тем же `request_id` не расходует rate-limit квоту повторно.
7. Migration candidate отзывает anon INSERT и удаляет публичные policy.
8. Отдельная `leader_leads_insert_app` сохраняет ручное создание заявки только активным CRM-пользователям через `leader_private.leader_has_access()`.
9. Rollback восстанавливает подтверждённый baseline без изменения исторических строк.

## Порядок production cutover

Каждый пункт требует отдельного явного разрешения владельца.

1. Повторить read-only grants/policies preflight.
2. Убедиться, что `SUPABASE_SECRET_KEYS` содержит ключ `default`, не выводя значение.
3. Создать приватную соль `LEADER_PUBLIC_RATE_LIMIT_SALT`, не выводя её в журнал.
4. Применить rate-limit candidate `20260724_02_public_intake_rate_limit_candidate.sql`.
5. Проверить, что rate-limit RPC доступна только service role.
6. Развернуть Edge candidate вместе с `rate-limit.ts`, `verify_jwt=false`.
7. Выполнить технический POST только после отдельного разрешения и подтвердить запись через backend credential.
8. Проверить обычную заявку, безопасный повтор и контролируемый ответ 429 на синтетических данных.
9. Применить основной database candidate в коротком согласованном окне.
10. Проверить postconditions: anon INSERT=false; authenticated manual lead INSERT=true; service role INSERT=true.
11. Выполнить один согласованный browser E2E по #206.
12. Проверить одну заявку, audit outcome, CRM trace и отсутствие дубля.
13. Проверить, что ручная заявка активного сотрудника CRM создаётся.
14. Проверить, что прямой browser/PostgREST INSERT отклоняется.

## Stop conditions

- live policy names или grants отличаются от contract snapshot;
- backend credential `default` отсутствует;
- приватная rate-limit соль отсутствует или короче 16 символов;
- rate-limit RPC доступна `anon` или `authenticated`;
- Edge candidate не может записать lead и audit до удаления public policies;
- rate-limit RPC недоступна, но Edge продолжает принимать заявки;
- raw IP появляется в таблице, audit или логах;
- ручное создание заявки в CRM не проверено;
- возникли неожиданные 4xx/5xx у опубликованной формы;
- rollback не готов к немедленному применению.

## Rollback order

1. Остановить дальнейшие тестовые отправки.
2. Восстановить предыдущую Edge version либо подтвердить необходимость временного public path.
3. Применить основной rollback candidate.
4. После отката Edge применить rate-limit rollback candidate.
5. Проверить, что сайт снова принимает заявки.
6. Зафиксировать интервал и причины отказа без публикации персональных данных.

## Безопасность

- ключи, соли и токены не сохраняются в GitHub;
- raw IP не хранится;
- production данные не удаляются и не исправляются;
- `nav_*` и `nav_v2_*` не затрагиваются;
- merge source candidate не означает разрешение на deploy, secret change или migration.
