# Производство и монтаж: порядок блокировок и закрытые заказы

04.10.2026. Base main `4c6ef522`. Продолжает #204/#226/#456, без нового workflow.

## Исправление staging

Две update RPC раньше блокировали job → order, тогда как create/design/order
команды используют order → job. Scoped migration
`20261004112419_operational_order_lock_guards_v1.sql` читает только parent id,
блокирует заказ, затем задание и повторно проверяет parent id. Изменение связи
во время ожидания даёт conflict. Закрытый, отменённый или архивный заказ
отклоняет новую команду update до изменения задания/заказа/audit/receipt.
Успешный receipt остаётся повтором ранее выполненной операции, а не новой записью.
Fresh RBAC, privacy, optimistic locking и service-only EXECUTE сохранены.
Неизвестный исходный fingerprint останавливает migration атомарно.

Migration установлена только в staging `otulfnouybahfnsycxqn`.
Actual staging SQL: create/update обеих сущностей, replay/inactive/role/actor/
privacy из PR569 плюс закрыт/closed/отменён/archive и stale update PASS.
Fixtures полностью ROLLBACK; независимый SELECT: orders/profiles/leads/receipts/
production jobs/installation jobs = 0. Auth users и временный OIDC доступ не создавались.

Существующий PostgreSQL CI расширен теми же transaction checks и двумя реальными
параллельными сессиями: A держит order, B вызывает update RPC и ждёт order,
A получает job lock, затем B завершает update. Старый обратный порядок не проходит.
Concurrency proof использует отдельную disposable localhost CI database, удаляемую
в finally. [CI 37199023832](https://github.com/deputat36/lider-bsk/actions/runs/37199023832)
completed/success на `b586d3bf`: обе actual concurrent RPC проверки PASS. Head
checks: 36 success + 1 skipped. Initial run `37198947931` выявил только ошибку
подготовки CI database (cluster roles уже существуют); исправлено reuse roles.
Последующая delta содержит только документацию доказательств.

## Production read-only preflight

`leader_production_jobs` и `leader_installation_jobs` имеют RLS, но grants для
anon/authenticated включают INSERT/UPDATE/DELETE/TRUNCATE. Installation INSERT/
SELECT/UPDATE policies проверяют лишь активный профиль. Production ALL policy
вызывает `leader_private.leader_has_access()`, которая также проверяет только
активность профиля. Следовательно canonical action permission отсутствует на
этих прямых путях; RLS не защищает TRUNCATE. Это подтверждённый ACL риск, не
доказательство злоупотребления и не выполненный production cutover.
Бизнес-строки production не менялись; authenticated production DML probes не выполнялись.

## Следующий шаг и rollback

Для production activation по-прежнему нужны положительные authenticated worker
UI/API сценарии, scoped candidates (с установленным core), закрытый backup,
исполняемый rollback и postflight. Не переносить staging migration напрямую.
Frontend/Edge production этого блока не менялись; новый production backup не нужен.
Staging rollback при необходимости: восстановить только две update definitions
из base main плюс upgrades PR569; не открывать browser DML и не откатывать core.
Не запускать исходную guarded migration повторно на уже обновлённом runtime.
