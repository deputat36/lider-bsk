# Управление прайсом: подготовка production-пакета — 14.10.2026

Контур: только РА «Лидер», production `ofewxuqfjhamgerwzull`, staging
`otulfnouybahfnsycxqn`, issue #152. Разрешение владельца на необходимые Leader
production-изменения сохраняет обязательные staging proof, backup, rollback,
fresh preflight и advisors. Исторические статусы #381 сюда не входят.

Свежий SELECT-only preflight: 69 позиций, 0 price logs, 4 профиля; catalog RPC
и receipt helper отсутствуют. Canonical role matrix, actor helpers и receipts
уже установлены. Общий core повторно не применяется. `catalog.manage` разрешён
только owner/admin. Табличные и колонковые права браузера на запись ещё открыты;
RLS ограничивает строки, но не заменяет закрытие прямого write-path.

Authenticated staging E2E `38545478671`, head `437ea2d5`, успешен: manager 403;
owner create, replay без дубля, update, stale 409, JWT readback и два price logs.
Artifact `11883993333` (1552 байта, SHA-256
`407214bb09480ec953d33ec75ac6c13799b1ac7e5900de6252b4b61fb1dec6ee`) скачан
и проверен. Cleanup удалил временный Auth user; все 24 группы остатка равны нулю.
Независимое SQL-чтение подтвердило catalog/logs/receipts/synthetic profiles = 0.
Production test rows не создавались.

CLI 2.120.0 получен из официального release, архив проверен по SHA-256;
`migration new` создал `20261014095201_catalog_management_production_v1.sql`.
Файл перенесён в `production-candidates`, чтобы исключить случайный общий db push.
Builder берёт точный staging business RPC и narrow receipt helper. JWT Edge
меняет только exact project gate. Секреты не входят в пакет.

Установка выполняется одной транзакцией с коротким lock timeout. До изменений
в private `leader_rollout_backups` сохраняются обе таблицы и метаданные
ACL/RLS/колонок; проверяется production core marker и отсутствие exposed backup.
Команда остаётся SECURITY INVOKER, только service-role EXECUTE; private helper
может убрать только свой in-progress catalog.manage receipt. Никаких широких
DELETE grants для receipts нет. Роль проверяется до replay.

Cutover закрывает прямые INSERT/UPDATE/DELETE/TRUNCATE и колонковые write grants.
SELECT каталога для существующих расчётов сохраняется. SELECT price logs
сужается до canonical catalog.read через изменение существующей политики;
политики и функции не удаляются. Имеющиеся 69 цен и рабочие записи не меняются.

`leader_catalog_management_stop_rollback.sql` отнимает EXECUTE двух новых
функций у service_role и браузера. Он сохраняет данные, историю и закрытые
browser writes. Для остановки интерфейс возвращается в режим просмотра.
Обратное открытие старого прямого доступа не является безопасным откатом.

Disposable PostgreSQL proof запускает точный candidate: атомарные create/update,
audit failure, stale и receipt cleanup, actor/role/inactive replay, idempotency
conflict, table+column ACL, read privacy и фактический REVOKE с rollback to
savepoint. Этот тест не подключается к production.

На этапе подготовки production не изменена, интерфейс остаётся в режиме
просмотра. Activation разрешена только после успешного exact package CI,
повторного live preflight, private backup и postflight. Authenticated production
owner UI ещё не доказан; локальные fixtures и staging API не подменяют его.
