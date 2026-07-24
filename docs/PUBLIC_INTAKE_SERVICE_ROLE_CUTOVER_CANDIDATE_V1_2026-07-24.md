# Public intake service-role cutover candidate v1 — 2026-07-24

Связано с #201 и #206.

Статус: source-only. Production не изменён.

## Подтверждённый live-разрыв

Read-only preflight 24.07.2026 подтвердил:

- `anon` имеет `INSERT` на `public.leader_leads`;
- `anon` имеет `INSERT` на `public.leader_public_lead_audit`;
- обе таблицы имеют публичные INSERT-policy;
- Edge source пишет в PostgREST через `SUPABASE_ANON_KEY`;
- `service_role` уже имеет INSERT на обе таблицы;
- ручное создание заявки в CRM использует authenticated direct insert и должно быть сохранено.

## Что подготовлено

1. Edge source использует `SUPABASE_SECRET_KEYS['default']`.
2. Новый `sb_secret_*` передаётся только в `apikey`.
3. Legacy `SUPABASE_SERVICE_ROLE_KEY` остаётся временным fallback и передаётся в `apikey` и `Authorization`.
4. Без backend credential функция отвечает `server_not_configured` и не пытается писать через anon.
5. Migration candidate отзывает anon INSERT и удаляет публичные policy.
6. Отдельная `leader_leads_insert_app` сохраняет ручное создание заявки только активным CRM-пользователям через `leader_private.leader_has_access()`.
7. Rollback восстанавливает подтверждённый baseline без изменения исторических строк.

## Порядок production cutover

Каждый пункт требует отдельного явного разрешения владельца.

1. Повторить read-only grants/policies preflight.
2. Убедиться, что `SUPABASE_SECRET_KEYS` содержит ключ `default`, не выводя значение.
3. Развернуть Edge candidate с `verify_jwt=false`.
4. Выполнить технический POST только после отдельного разрешения и подтвердить запись через backend credential.
5. Применить database candidate в коротком согласованном окне.
6. Проверить postconditions: anon INSERT=false; authenticated manual lead INSERT=true; service role INSERT=true.
7. Выполнить один согласованный browser E2E по #206.
8. Проверить одну заявку, audit outcome, CRM trace и отсутствие дубля.
9. Проверить, что ручная заявка активного сотрудника CRM создаётся.
10. Проверить, что прямой browser/PostgREST INSERT отклоняется.

## Stop conditions

- live policy names или grants отличаются от contract snapshot;
- backend credential `default` отсутствует;
- Edge candidate не может записать lead и audit до удаления public policies;
- ручное создание заявки в CRM не проверено;
- возникли 4xx/5xx у опубликованной формы;
- rollback не готов к немедленному применению.

## Rollback order

1. Остановить дальнейшие тестовые отправки.
2. Восстановить предыдущую Edge version либо подтвердить необходимость временного public path.
3. Применить rollback candidate.
4. Проверить, что сайт снова принимает заявки.
5. Зафиксировать интервал и причины отказа без публикации персональных данных.

## Безопасность

- ключи и токены не сохраняются в GitHub;
- raw IP не хранится;
- production данные не удаляются и не исправляются;
- `nav_*` и `nav_v2_*` не затрагиваются;
- merge source candidate не означает разрешение на deploy или migration.
