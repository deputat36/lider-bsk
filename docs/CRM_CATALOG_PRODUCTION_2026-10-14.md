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
Builder берёт staging business RPC и narrow receipt helper. Live тела сверены:
различия только в форматировании и одном комментарии. JWT Edge
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

## Результат установки и точка продолжения

PR #587 объединён в main `d46b3f9ea131b2de97540fd0c01e0f977f61caa8`, дерево
`c931b72af5f2a69270f328dda8a209e4cd7027ca` совпало с проверенным локальным.
Финальный PR head `473b3e13`: 36/36 check-runs успешны. Main: 40/40 check-runs,
включая PostgreSQL package proof и Pages. Старый acceptance выбирал update
по времени и UUID; в одной транзакции оба события имеют одинаковый now().
Builder выбирает `price_update`, сохраняя old/new/actor и exactly-two assertions.

После green CI и повторного native preflight два вызова `apply_migration`
вернули `McpServerError: Invalid or expired requestState`, code `-32602`,
reason `invalid_request_state`. Повтор был выполнен только после независимого
чтения, исключившего частичную установку. После второй ошибки снова проверено:
RPC=false, helper=false, scoped snapshot=0, catalog=69, price logs=0;
прежний browser UPDATE grant остаётся. Следовательно, cutover не выполнен.
Edge deployment и production frontend opt-in не запускались. Реальные цены,
профили, Auth, Storage, роли и RLS не изменены этим этапом.

Подключение Supabase обнаружено как installed/ENABLED; чтение работает.
Причина отказа обработки write-запроса не установлена. Это техническая ошибка
сервиса, не подтверждённый отказ владельца или automatic approval review.
Обход через другой write endpoint не выполняется. Runtime-файл интерфейса
сохранён с прежним staging gate; экспериментальный frontend transport не
опубликован. Backup/rollback подготовлены, но новый production snapshot ещё
не создан: его запись входит в атомарную миграцию.

Продолжать с этой точки: после восстановления выполнения изменений повторить
native preflight, сверить отсутствие RPC/helper/Edge/snapshot и взять candidate
из проверенного main. Выполнить миграцию, проверить private backup и ACL,
доставить exact JWT Edge, снять advisors и сверить неизменность business rows.
Только затем готовить и проверять frontend opt-in, retry и смену роли.
Ни общий core, ни старые цены, ни cleanup #381 не повторять.

## Read-only сверка 23.10.2026

Пакет #587 пока не установлен: native SELECT и список Edge подтверждают отсутствие
RPC/helper/catalog Edge/scoped snapshot. Все его предусловия по прежнему core,
canonical helpers, owner/admin matrix, private backup, RLS и SELECT policy
выполняются. Имеются прежние 69 позиций и 0 price logs; рабочие строки не менялись.
Успех read-only preflight не подтверждает исправление прежнего write-сбоя сервиса.

PR #591/#592 опубликованы; frontend исправляет сохранность полей, конфликт,
точный повтор и поздний ответ. Калькулятор теперь вызывает общий command writer
вместо прямого browser INSERT. Оба интерфейса сохраняют production gate до
серверного cutover. Последовательность установки, postflight и неразрушающей
остановки выше остаётся актуальной; изменять production одним frontend-флагом нельзя.
