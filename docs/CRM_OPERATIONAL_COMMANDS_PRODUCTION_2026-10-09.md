# Production-команды производства и монтажа — 09.10.2026

## Scope и основания

Leader-only production `ofewxuqfjhamgerwzull`; staging `otulfnouybahfnsycxqn`.
Owner authorization из инструкции продолжения: production после fresh preflight,
staging proof, scoped private backup, executable stop rollback и postflight.
Общий RBAC/receipts core, Auth/Storage, nav_* и реальные бизнес-строки не заменяются.
Предыдущий полный authenticated worker proof: run 37208075574 SUCCESS, PR #572.

Read-only preflight: operational RPC в production отсутствуют; колонки jobs,
events, installation items совместимы с staging. Найден недостающий private
layout approval helper; он включён в пакет. Старые production note/event RPC
отзываются у browser ролей вместе с прямыми writes. Production jobs=0,
installation jobs=0, orders=2, payments=1, expenses=0.

## Пакет

`20261009053427_operational_commands_production_v1.sql` создан через CLI migration
new и перенесён в production-candidates, чтобы исключить автоматический db push.
Пакет содержит 15 проверенных runtime-функций staging и layout approval helper,
с проверкой fingerprints всех 15 после установки. Команды: create/update
production, create/read/update installation. Fresh RBAC до receipt, actor binding,
privacy projection, planned price permission, order → job locks и closed guards
сохранены. Role matrix и ранее установленный core не перезаписываются.

В одной транзакции сохраняется private snapshot шести Leader-таблиц, ACL,
policies, column ACL и legacy function definitions; backend требует правильный
core backup project_ref и отсутствие новых функций. Browser DML/TRUNCATE,
column writes и RPC EXECUTE закрываются; queues получают только безопасные
колонки и canonical permissive + restrictive read policies. Installation details
читаются через service-only read RPC после JWT/canonical permission на Edge.

Backup id: `operational-commands-20261009-v1`, таблица
`leader_private.leader_rollout_backups`; browser/service_role SELECT запрещён.
Snapshot business rows проверяется внутри установки, не экспортируется в GitHub.
Frontend gates включаются отдельным изменением после backend postflight.

## Проверки

Staging rehearsal exact function bodies/ACL/snapshot + existing operational SQL
scenarios PASS, outer ROLLBACK. Production-only preflight в этой rehearsal заменён
на staging environment guard; private backup table создана только внутри rollback.
Независимый postflight: backup table отсутствует, fixture profiles/orders/receipts=0.
Disposable production candidate proof включён в существующий client registry CI:
реальные commands/replay/RBAC/privacy/closed guards; старые permissive policies,
table и column grants; семь ролей/inactive read и actual stop REVOKE/rollback.
CI результат и deployment checkpoint фиксируются в PR перед активацией.

## Откат и пределы

`leader_operational_commands_stop_rollback.sql` отнимает service EXECUTE новых
публичных RPC, сохраняя строки/историю/receipts и более строгие права чтения.
Перед применением stop отключить frontend gate и вернуть read-only UI.
Широкие browser writes не восстанавливать. После исправления и повторного proof
восстановить только service_role EXECUTE. Постпроверка — отдельный
`leader_operational_commands_postflight.sql`.

Этот этап сам по себе не доказывает authenticated production worker UI.
Production Edge и frontend ещё требуют согласованной активации; financial и
internal fields не возвращаются через operational responses. Публичные формы,
production test money и реальные заказы не используются для пробных записей.
