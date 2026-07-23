# Production candidate: Edge Function монтажа

Дата: 23 июля 2026 года  
Репозиторий: `deputat36/lider-bsk`  
Production Supabase: `ofewxuqfjhamgerwzull`

## Статус

`source_only_generator_ready_not_deployed`

Production Edge не развёртывался во время подготовки кандидата.

## Источники

Generator:

`tools/generate_crm_installation_production_edge_candidate.py`

Staging sources:

- `supabase/staging-functions/leader-crm-installation/index.ts`;
- `supabase/staging-functions/leader-crm-installation/contract.ts`.

Source Git blob SHA:

- index: `a603fc11db7dc66435c6fea4c3547775d79feac9`;
- contract: `940c39edac833417aa1727ca04badd52fb5a415c`.

## Что делает generator

1. Проверяет Git blob SHA обоих staging source-файлов.
2. Заменяет только environment identity:
   - `STAGING_PROJECT_REF` → `PRODUCTION_PROJECT_REF`;
   - `otulfnouybahfnsycxqn` → `ofewxuqfjhamgerwzull`;
   - `expected: 'staging'` → `expected: 'production'`.
3. Не изменяет JWT, validation, permission gate, actions, RPC routes и error mapping.
4. Выпускает deploy package:
   - `index.ts`;
   - `contract.ts`;
   - `deploy-manifest.json`.

Команда генерации:

```bash
python3 tools/generate_crm_installation_production_edge_candidate.py
```

Output directory:

`build/installation-production-edge-candidate/leader-crm-installation`

Генерация не требует Supabase credentials и не меняет production.

## Deployment identity

- slug: `leader-crm-installation`;
- entrypoint: `index.ts`;
- files: `index.ts`, `contract.ts`;
- `verify_jwt=true`;
- target project ref: `ofewxuqfjhamgerwzull`.

Production deploy не одобрен и не выполнялся.

## Неизменённый security flow

`POST → environment identity → payload size → JWT user lookup → request validation → canonical permission → service-role RPC → safe response`

Поддерживаются actions:

- `installation_job.read` → `installation.read`;
- `installation_job.update` → `installation.write`.

Edge не принимает роль в browser payload. Actor определяется только по реальному пользовательскому JWT.

Canonical permission проверяется через:

`leader_actor_has_crm_action_rpc`

Read выполняется через:

`leader_read_installation_job_rpc`

Update выполняется через:

`leader_update_installation_job_rpc`

## Database dependency gate

До production Edge deploy должны быть отдельно применены и проверены:

1. RBAC/receipts candidate из PR #452;
2. read RPC output из PR #453;
3. update RPC output из PR #453.

Сейчас эти слои находятся только в `main` как source-only candidates. В production они отсутствуют.

Edge deploy до завершения database gate запрещён.

## Approval gates

Отдельное явное разрешение требуется для:

1. production RBAC/receipts migration;
2. production read RPC migration;
3. production update RPC migration;
4. production Edge deploy;
5. production frontend switch;
6. production authenticated browser smoke и временных fixtures.

Не объединять эти действия в одну операцию.

## Preflight перед будущим Edge deploy

1. Подтвердить project ref `ofewxuqfjhamgerwzull`.
2. Повторить production readiness SQL.
3. Подтвердить наличие и ACL RBAC/receipts layer.
4. Подтвердить fingerprints read/update RPC.
5. Подтвердить нулевой незапланированный schema drift.
6. Сгенерировать package заново на текущем `main`.
7. Подтвердить source blob SHA.
8. Подтвердить `verify_jwt=true` в manifest и deploy call.
9. Подтвердить отсутствие `leader-crm-installation` в production либо зафиксировать текущую версию для rollback.
10. Получить отдельное явное разрешение на production Edge deploy.

Любое расхождение — stop condition.

## Future deploy order

1. Сохранить production preflight evidence.
2. Сгенерировать package.
3. Проверить checker и CI artifacts.
4. Вызвать deploy только для `leader-crm-installation` с `verify_jwt=true`.
5. Не переключать frontend.
6. Перечитать deployed function и зафиксировать version/SHA.
7. Проверить Edge logs и advisors.
8. Выполнить только server-side no-fixture smoke: missing JWT/invalid JWT.
9. Остановиться до отдельного frontend approval.

## Обязательный postflight

- function slug точный;
- status `ACTIVE`;
- `verify_jwt=true`;
- deployed source содержит production project ref;
- staging project ref отсутствует;
- JWT user lookup присутствует;
- canonical permission RPC присутствует;
- read/update RPC routes присутствуют;
- actions/permissions совпадают;
- Edge logs не содержат boot/runtime errors;
- production frontend route остаётся `production_locked`;
- production данные не изменились.

## Rollback

Fail-closed rollback source:

`supabase/production-candidates/edge/leader-crm-installation-rollback/index.ts`

Rollback deploy использует тот же slug и `verify_jwt=true`, но:

- не читает service-role/secret key;
- не вызывает Auth API;
- не вызывает database RPC;
- отвечает `503` с кодом `production_installation_temporarily_disabled`;
- оставляет frontend route заблокированным.

Rollback deploy также требует отдельного явного разрешения.

## Production boundary

- Production database не изменялась.
- Production Edge не развёртывался.
- Production frontend не переключался.
- Auth, Storage и данные не изменялись.
- `nav_*` не изменялся.
- frontend route остаётся `production_locked`.
