# Staging frontend «заказ → производство» — 2026-08-09

## Фактический статус

- backend-команда `production_job.create_from_order` и Edge Function `leader-crm-production-create v1` уже доказаны и развёрнуты только в staging `otulfnouybahfnsycxqn`;
- CRM transport и карточный entrypoint подготовлены source-only;
- рабочий `config.js` продолжает указывать на production `ofewxuqfjhamgerwzull`;
- при production config модуль завершает работу до регистрации DOM listeners и не выполняет Network-запросы;
- authenticated positive browser E2E не выполнен без отдельного staging Auth user и staging-конфигурации CRM;
- production Supabase, config, данные и deployment не изменены.

## Frontend boundary

`production-job-staging-transport-v1.js`:

- допускает только exact hostname `otulfnouybahfnsycxqn.supabase.co`;
- использует текущую JWT-сессию `supabaseClient`;
- вызывает только `leader-crm-production-create`;
- требует browser action `production.write`, а entrypoint требует `production.read`;
- отправляет envelope только из `action`, `request_id`, `expected_updated_at` и `payload`;
- не отправляет actor, author, owner, production status, client, phone, payment, balance, profit или internal comment;
- различает create, replay, validation, forbidden, stale order, layout conflict, active-job conflict, idempotency conflict и persistence failure;
- после create выполняет exact idempotent replay той же команды и принимает только ответ с тем же production job без дубликата.

`production-job-staging-preview-v1.js` загружается вместе с lazy-группой `orders`, но создаёт UI только в exact staging environment. Design-task preview и entrypoints теперь также импортируются напрямую группой `orders`, поэтому не зависят от открытия карточки заявки или `site-cache-note-v1.js`.

## Предварительные условия browser E2E

1. Отдельный временный staging Auth user, не связанный с production identity.
2. Активный `leader_user_profiles` row с canonical `production.read` и `production.write`; для текущей безопасной проекции заказа также нужен `design.read`.
3. Отдельная staging-сборка CRM, где URL и public key принадлежат только `otulfnouybahfnsycxqn`, а auth storage key не совпадает с production.
4. Синтетический незакрытый заказ с `layout_status = Макет согласован`, актуальным `updated_at` и, при использовании design task, согласованной задачей этого же заказа.
5. До начала и после cleanup — нулевые counts синтетических production jobs, events и command receipts выбранного префикса.

## Положительный сценарий

1. Войти временным staging user.
2. Открыть вкладку `orders` напрямую и карточку синтетического заказа.
3. Подтвердить наличие обоих действий: design-task preview и `Передать в производство (staging)`.
4. Открыть production preview и проверить минимальный JSON без клиентских и финансовых полей.
5. Нажать `Создать тестовое задание в staging` один раз.
6. В Network подтвердить первый POST к `leader-crm-production-create`: HTTP 201, `idempotent_replay=false`.
7. Подтвердить автоматический второй POST с тем же business payload и idempotency key: HTTP 200, `idempotent_replay=true`, тот же `job.id`.
8. Проверить ровно один production job, одно событие и один successful receipt.
9. Проверить обновлённый производственный этап заказа и связь согласованной design task.

## Отрицательные сценарии

- нет сессии: `auth_required`, Edge не вызывается;
- нет `production.write`: `forbidden`, Edge не вызывается;
- изменённый после preview заказ: HTTP 409, `stale_order`;
- активное production job: HTTP 409, `active_job_conflict`;
- макет не согласован: preview блокирует команду, server возвращает layout validation/conflict при ручной проверке;
- тот же idempotency key с другим payload: HTTP 409, `idempotency_conflict`;
- production config: staging entrypoint отсутствует, POST к `leader-crm-production-create` отсутствует.

## Network evidence

Разрешены:

- безопасный SELECT заказа и, при наличии `design.read`, design tasks из staging;
- два JWT POST к staging `leader-crm-production-create`: create и контрольный replay.

Запрещены:

- service-role key в браузере;
- прямые browser INSERT/UPDATE/UPSERT/DELETE;
- direct RPC;
- запросы к production project ref;
- actor/status/client/payment/profit во входном command envelope.

## Cleanup и оставшийся gate

Удалить synthetic rows, staging profile и временного Auth user штатным staging cleanup. Подтвердить нулевой остаток и повторно запустить staging acceptance checker.

Production rollout запрещён без отдельного явного решения владельца. Этот этап не добавляет production RLS/grants/RPC/Edge/Auth и не включает рабочую production-кнопку.
