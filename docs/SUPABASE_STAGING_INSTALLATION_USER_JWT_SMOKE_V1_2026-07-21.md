# Staging installation user-JWT smoke v3

Дата выполнения: 22 июля 2026 года.

## Результат

Реальный JWT-контур Edge `leader-crm-installation v2` проверен на staging `otulfnouybahfnsycxqn`.

Использовались два краткоживущих Auth-пользователя с active profiles:

- manager — разрешены `installation.read` и `installation.write`;
- accountant — оба действия запрещены.

Пользователи создавались официальным server-side Auth Admin API. Пароли, JWT и ключи не записывались в репозиторий, evidence или логи.

## Фактические сценарии

- read без JWT → `401`;
- read с invalid JWT → `401`;
- accountant read → `403`;
- manager read → `200`;
- accountant update → `403`;
- manager update → `201`;
- повтор той же update-команды → `200` с idempotent replay;
- read после update → `200`.

## Проверенные свойства

- safe projection скрывает все `SENSITIVE_*` маркеры;
- internal comment не возвращается;
- prices позиций не возвращаются;
- job и связанный order синхронно получают статус «Запланирован»;
- replay не создаёт второе update event;
- receipt создаётся один раз.

## Найденный и исправленный дефект

Первый post-update read выявил отсутствие `order.installation_status` в projection. Сама строка order обновлялась правильно.

Дефект исправлен migration `20260722055815 / staging_installation_read_order_status_fix_20260722`.

Текущий read RPC:

- MD5 `5a353818606012d0e657a83f133723b6`;
- 5432 bytes.

Write RPC не изменилась:

- MD5 `0ed4669197dac1f2695e763d0eec54e1`;
- 19061 bytes.

## Cleanup

После финального успешного запуска:

- Auth users: `0`;
- profiles: `0`;
- orders/production/jobs/items/events/comments: `0`;
- command receipts: `0`;
- временный `pg_net` удалён;
- schema `net` отсутствует;
- bootstrap version 8 permanently locked, `verify_jwt=true`, HTTP `410`.

Reusable lifecycle для будущих повторов находится в `tools/run_crm_staging_installation_auth_fixture_lifecycle.mjs`. Source-only runner с готовыми JWT сохранён для диагностических сценариев.

Полное evidence: `contracts/crm-staging-installation-runtime-smoke-v1.json`.

## Следующий gate

Разрешён отдельный exact-staging frontend wiring review. Production rollout по-прежнему запрещён без отдельного approval и отдельного production backend deployment.

## Production boundary

Production `ofewxuqfjhamgerwzull` не вызывался runtime smoke и не изменялся. В production отсутствуют read RPC, fix migration и installation/bootstrap Edge.
