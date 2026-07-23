# Production candidate: installation read/update RPC

Дата: 23 июля 2026 года  
Репозиторий: `deputat36/lider-bsk`  
Production Supabase: `ofewxuqfjhamgerwzull`

## Статус

`source_only_generator_ready_not_applied`

Production не изменялся во время подготовки RPC-кандидата.

## Зачем используется генератор

Проверенные staging-функции содержат более 700 строк SQL. Ручное копирование создаёт риск незаметного изменения бизнес-логики.

`tools/generate_crm_installation_production_rpc_candidate.py`:

1. читает два exact source-файла из `main`;
2. вычисляет Git blob SHA и сравнивает с зафиксированными значениями;
3. отбрасывает только staging header/guard до первого function marker;
4. сохраняет function body без редактирования;
5. добавляет production-only preflight;
6. выпускает два SQL-файла в build-каталог.

## Проверенные источники

Read RPC:

- source: `supabase/staging-migrations/20260722_06_installation_read_rpc_main_reconcile.sql`;
- Git blob SHA: `f001cec60245f1f48b8a0b71b8651fa84c6c4a6a`;
- runtime MD5: `5a353818606012d0e657a83f133723b6`;
- runtime bytes: 5432.

Update RPC:

- source: `supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql`;
- Git blob SHA: `700728bbead1fb9270390aafb50cfe26816767cd`;
- runtime MD5: `0ed4669197dac1f2695e763d0eec54e1`;
- runtime bytes: 19061.

## Генерация artifacts

Генерация не требует Supabase credentials и не меняет базы:

```bash
python3 tools/generate_crm_installation_production_rpc_candidate.py
```

Outputs:

- `build/installation-production-rpc-candidate/20260723_02_installation_read_rpc_candidate.sql`;
- `build/installation-production-rpc-candidate/20260723_03_installation_update_rpc_candidate.sql`.

CI генерирует эти файлы заново и сохраняет их как диагностический artifact.

## Что добавляет production preflight

Оба output-файла:

- блокируют запуск при наличии `leader_staging.environment_guard`; точный stop code — `production_rpc_candidate_rejected_on_staging`;
- требуют установленный RBAC/receipts layer;
- требуют все таблицы и поля, используемые RPC;
- блокируют установку поверх существующей target function;
- не создают и не изменяют `nav_*`;
- не меняют Auth, Storage, Edge или frontend.

Update output дополнительно:

- требует установленный read RPC; при его отсутствии используется stop code `installation_read_rpc_dependency_missing`;
- требует `extensions.digest(bytea,text)`;
- тем самым фиксирует порядок применения read → update.

## Read RPC

Action: `installation_job.read`  
Permission: `installation.read`

Privacy-safe projection:

- исключает client contacts;
- исключает финансовые поля;
- исключает internal comments;
- ограничивает items до 120;
- events до 30;
- comments до 20.

`public`, `anon`, `authenticated` не получают `EXECUTE`. RPC доступен только `service_role`.

## Update RPC

Action: `installation_job.update`  
Permission: `installation.write`

Гарантии:

- атомарное обновление job, order и event;
- optimistic concurrency по `expected_updated_at`;
- row locks;
- idempotency по action/key и action/request_id;
- SHA-256 request hash;
- allowlist patch fields;
- server-owned timestamps и actor fields;
- canonical status transition registry;
- durable receipt response/replay.

`public`, `anon`, `authenticated` не получают `EXECUTE`. RPC и helper-функции доступны только `service_role`.

## Dependency gate

Перед применением read RPC должны существовать:

- `leader_private.leader_role_action_matrix_v1`;
- `leader_private.leader_actor_has_crm_action(uuid,text)`;
- `public.leader_actor_has_crm_action_rpc(uuid,text)`;
- `leader_private.leader_command_receipts`.

Эти объекты пока находятся только в source-only кандидате, объединённом PR #452. В production они не применены.

## Approval gates

Генерировать artifacts локально или в CI можно без отдельного разрешения.

Отдельное явное разрешение требуется для каждого шага:

1. применить RBAC/receipts migration;
2. применить read RPC output;
3. применить update RPC output;
4. deploy production Edge;
5. переключить production frontend route;
6. создать временные production smoke fixtures.

Не объединять эти шаги в одну операцию.

## Preflight перед будущим apply

1. Повторить `docs/PREFLIGHT_INSTALLATION_PRODUCTION_ROLLOUT_2026-07-23.sql`.
2. Подтвердить, что production project ref — `ofewxuqfjhamgerwzull`.
3. Подтвердить отсутствие `leader_staging.environment_guard`.
4. Подтвердить, что RBAC/receipts layer уже применён и проверен.
5. Подтвердить нулевой drift source Git blob SHA.
6. Подтвердить отсутствие target RPC до каждого apply.
7. Подтвердить, что production route остаётся `production_locked`.
8. Получить отдельное явное разрешение.

Любое расхождение — stop condition.

## Postflight после будущего read apply

- function существует;
- SECURITY INVOKER;
- `search_path=''`;
- `anon_execute=false`;
- `authenticated_execute=false`;
- `service_role_execute=true`;
- privacy projection markers присутствуют;
- function fingerprint сравнивается с staging baseline;
- Edge и frontend ещё не меняются.

## Postflight после будущего update apply

- helper-functions и update RPC существуют;
- SECURITY INVOKER;
- `search_path=''`;
- browser execute отсутствует;
- service role execute присутствует;
- receipts table остаётся пустой до smoke;
- action/permission/allowlist markers совпадают;
- function fingerprint сравнивается со staging baseline;
- advisors не показывают новых ERROR/WARN.

## Rollback

Source:

`supabase/production-candidates/rollback/20260723_02_03_installation_rpc_candidate_rollback.sql`

Rollback удаляет:

- update RPC;
- четыре update helper-функции;
- read RPC.

Rollback сохраняет:

- canonical RBAC core;
- actor permission bridge;
- command receipts table;
- все public CRM tables и данные.

Rollback блокируется кодом `installation_command_receipts_present`, если уже существует хотя бы один receipt с action `installation_job.update`.

не выполнять broad schema drop.

## Production boundary

- Production database migration не применялась.
- Production Edge не развёртывался.
- Production frontend не переключался.
- Auth и fixtures не изменялись.
- `nav_*` не изменялся.
