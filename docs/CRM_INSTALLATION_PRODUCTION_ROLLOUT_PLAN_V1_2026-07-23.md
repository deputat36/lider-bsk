# Production rollout plan монтажа

Issue #456.

Статус: source-only план подготовлен, production execution не выполнялся.

## Назначение

Документ объединяет четыре уже проверенных production-кандидата в один последовательный rollout:

- RBAC и durable command receipts из PR #452;
- installation read/update RPC из PR #453;
- `leader-crm-installation` Edge package из PR #454;
- server-only frontend package из PR #455.

Все кандидаты находятся в `main`, но не применены к production.

## Последовательность

`P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8`

Нельзя объединять несколько mutating phases в одно разрешение.

## P0 — повторный read-only preflight

Проверить непосредственно перед rollout:

- project ref равен `ofewxuqfjhamgerwzull`;
- заказы и installation-таблицы соответствуют подтверждённому baseline;
- роли ограничены ожидаемыми значениями;
- role/action matrix, receipts, read/update RPC и installation Edge ещё отсутствуют;
- рабочий loader продолжает использовать card v2;
- candidate contracts и source blob SHA не изменились;
- Security Advisor не показывает новый installation-specific WARN или ERROR.

Известные предупреждения `nav_*` не относятся к installation rollout. `nav_*` не менять.

## P1 — RBAC и receipts

Следующий gate: explicit production approval for P1 only.

Применить только:

`supabase/production-candidates/20260723_01_installation_rbac_receipts_candidate.sql`

После применения подтвердить:

- canonical role/action matrix существует;
- неизвестная роль и неизвестное действие получают deny;
- inactive profile получает deny;
- actor permission bridge доступен только `service_role`;
- browser roles не имеют SELECT/INSERT/UPDATE на private tables;
- browser roles не имеют EXECUTE на permission RPC;
- durable receipts пусты.

При ошибке использовать только отдельный rollback этого слоя. Broad schema drop запрещён.

## P2 — read RPC

Отдельное разрешение.

Сначала сгенерировать SQL через versioned generator из PR #453. Применить только read RPC candidate.

Postflight:

- функция SECURITY INVOKER;
- `search_path=''`;
- EXECUTE только для `service_role`;
- MD5 и размер соответствуют validated staging baseline;
- privacy projection не содержит контакты клиента, финансовые поля и internal comments.

## P3 — update RPC

Отдельное разрешение после успешного P2.

Postflight:

- функция SECURITY INVOKER;
- EXECUTE только для `service_role`;
- optimistic concurrency сохраняет точную PostgreSQL timestamp precision;
- idempotency и request hash работают;
- job/order/event/receipt изменяются атомарно;
- durable receipts до smoke остаются пустыми.

## P4 — Edge deploy

Отдельное разрешение после database postflight.

Развернуть `leader-crm-installation` только из generated package PR #454:

- production project identity;
- actions `installation_job.read` и `installation_job.update`;
- `verify_jwt=true`;
- JWT-first user lookup;
- canonical permission RPC;
- отсутствие browser-supplied role;
- отсутствие service-role key в браузере.

До завершения P5 и P6 рабочий loader остаётся на card v2.

Rollback P4 — fail-closed Edge с HTTP 503, тем же slug и `verify_jwt=true`.

## P5 — API/JWT smoke

Без frontend switch проверить:

- missing JWT → 401;
- invalid JWT → 401;
- authenticated user без права → 403;
- пользователь с `installation.read` проходит permission gate;
- пользователь с `installation.write` проходит permission gate;
- not-found сценарий не создаёт данные;
- Edge logs не содержат неожиданных 5xx.

## P6 — временный authenticated browser smoke

Требует отдельного разрешения на временные production Auth/data fixtures.

Обязательный порядок:

1. создать только согласованные одноразовые fixtures;
2. открыть реальную карточку через production Edge;
3. выполнить ровно одну update-мутацию;
4. подтвердить server read-back и privacy projection;
5. проверить idempotent replay;
6. удалить receipts, comments, events, items, job, order, profile и Auth user;
7. подтвердить нулевой cleanup postflight.

Если cleanup неполный, rollout останавливается и frontend не переключается.

## P7 — frontend loader switch

Отдельное разрешение только после успешного P6.

Generated package PR #455 создаёт:

- route v2;
- production read transport;
- production write transport;
- card v3;
- candidate `crm-v4-tab-loader-v1.js`.

Переключается только dynamic import внутри разрешённого lazy-loader; `index.html` остаётся без eager script монтажа:

- было: card v2;
- становится: card v3.

Card v3 использует server-only read/write. Прямые browser table reads/writes отсутствуют. Комментарии остаются read-only до отдельной server action.

Rollback P7: немедленно восстановить dynamic import card v2 в `crm-v4-tab-loader-v1.js`; eager script в `index.html` не добавлять. Candidate-файлы могут оставаться неиспользуемыми.

## P8 — наблюдение и финальный postflight

Проверить:

- Edge ACTIVE и `verify_jwt=true`;
- API/Auth/Edge/Postgres logs;
- отсутствие новых installation-specific advisor findings;
- browser EXECUTE denial на business RPC;
- fingerprints RPC;
- нулевые synthetic fixtures и receipts;
- отсутствие прямого browser persistence в card v3;
- отсутствие изменений `nav_*`.

## Stop conditions

Остановить rollout при любом условии:

- production project ref не совпадает;
- появились неожиданные рабочие строки относительно preflight;
- contract, source blob или fingerprint drift;
- обнаружена неизвестная роль;
- browser role получил EXECUTE на installation business RPC;
- Edge развёрнут без `verify_jwt=true`;
- JWT smoke дал неожиданный статус;
- fixture cleanup не вернул нулевые counts;
- появился новый installation-specific security WARN/ERROR;
- для продолжения требуется изменение `nav_*`.

## Rollback order

1. Вернуть loader с card v3 на card v2.
2. Развернуть fail-closed Edge rollback.
3. Удалять installation RPC только после блокировки frontend.
4. Удалять RBAC/receipts только если нет зависимых RPC и receipts пусты.
5. Не удалять существующие public installation tables и рабочие данные.
6. Не выполнять broad schema drop.

## Генерация плана

```bash
python3 tools/generate_crm_installation_production_rollout_plan.py
```

Команда создаёт только:

- `build/installation-production-rollout-plan/rollout-plan.json`;
- `build/installation-production-rollout-plan/rollout-checklist.md`.

Она не требует Supabase credentials, не выполняет SQL, не deploy Edge и не меняет loader.

Production не изменён.
