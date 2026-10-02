# Заказ и финансовые операции: production rollout

Пакет PR563, backend применён 01.10.2026, frontend подготовлен к публикации 02.10.2026.
Разрешение владельца от 29.09 действует только в контуре РА «Лидер».

## Доступные действия

Карточка заказа содержит начало работы, готовность, передачу клиенту, закрытие,
отмену, изменение срока/комментария и отметку «Дизайн не требуется» с причиной.
Команды проверяют роль, состояние заказа, актуальную версию и связанные задания.
Незавершённый монтаж препятствует выдаче. Закрытие требует подтверждённой выдачи,
проверки расходов/документов и расчётов с клиентом. Owner/admin могут сохранить долг
при закрытии только с явной причиной. Выдача и закрытие сами не создают платёж.

Финансы: приход, фактический расход, метод, категория, дата, комментарий; отмена
ошибочной записи с причиной сохраняет строку и сумму. Права записи — owner/admin/accountant.
Оплачено/долг выводятся из проведённых подтверждённых платежей, а не редактируются вручную.
Повтор после потери ответа использует прежний ключ и ревизию. Все записи и audit
сохраняются атомарно. История действий заказа раскрывается по запросу.

## Фактически применено

- Production `ofewxuqfjhamgerwzull`: canonical matrix/permission bridge, private receipts,
  `leader_write_finance_rpc`, `leader_write_order_operation_rpc`, money projection trigger.
- Прямые browser INSERT/UPDATE/DELETE заказов, позиций и денег запрещены. Финансовый
  SELECT ограничен canonical `finance.read`; browser не может подделать order/finance audit.
- `leader-crm-orders` v3, `leader-crm-finance` v1; оба `verify_jwt=true`.
- Старый произвольный order PATCH отклоняется. Его отдельный staging endpoint
  `leader-crm-orders-impl` v2 возвращает 410 и не имеет доступа к DB/Auth.
- Код production orders побайтово совпадает с проверенным staging bundle.
  В finance bundle заменён только точный project ref и служебный комментарий.
- Auth, Storage, публичный intake и чужие проекты не изменялись.

## Backup, postflight и rollback

До DDL сохранён закрытый snapshot `leader_private.leader_rollout_backups`,
ключ `order-finance-20261001-v1`: строки затрагиваемых таблиц, ACL/RLS/columns/triggers,
старые функции и исходники двух прежних Edge. Ни browser, ни service_role не могут читать backup.
Снимок остаётся внутри production DB, персональные данные не публикуются в репозитории.

Генератор `python tools/build_leader_operational_rollout.py` создаёт rehearsal,
postflight и stop-rollback. Rehearsal по умолчанию заканчивается ROLLBACK.
В production rehearsal прошёл, отсутствие объектов после отката проверено; затем
тот же пакет применён с COMMIT. Postflight сравнил полные строки пяти таблиц со
snapshot: существующие бизнес-данные не изменились. Проверены grants, RLS, trigger,
права активных owner/admin и отказ отключённому профилю.

Проверен и отменён в транзакции stop-rollback: REVOKE EXECUTE у service_role для двух
новых RPC действительно блокирует команды. После ROLLBACK доступ восстановлен.
При инциденте: выключить frontend gate, применить `stop-rollback.sql`, оставить
каноническое чтение. Деньги, история и receipts сохраняются. Не восстанавливать
небезопасный raw PATCH или прежние широкие financial ALL policies. Исправление
конкретных ошибочных данных — отдельная сверка со snapshot и журналом, без массовой перезаписи.

Security/performance advisors: новых WARN/ERROR для Leader нет. Три INFO о закрытых
private tables без policies ожидаемы: RLS включён, browser grants отсутствуют.

## Проверки

- [Полный staging browser E2E 36875276336](https://github.com/deputat36/lider-bsk/actions/runs/36875276336):
  заявка → потребность → четыре расчёта → КП → заказ → дизайн → производство → монтаж
  → выдача → доплата → закрытие. Manager/owner UI/API; stale/retry/idempotency;
  отрицательная проверка выдачи до завершения монтажа и закрытия с неоплаченным долгом.
- 2 платежа, 1 отменённый расход, 4 финансовых и 4 order audit события проверены.
  Все 23 категории residue = 0; Auth user удалён. Независимый SELECT подтвердил очистку.
  Временное OIDC-доверие ветки снято, bootstrap v24 вернулся к исходному hash.
- Actual PostgreSQL 17 transaction tests: RBAC, immutable retry, stale revision,
  безопасное закрытие, financial projection, direct-write denial и rollback при сбое audit.
- Browser 360/390/768/1024/1440: finance/closure forms, keyboard/focus, a11y, overflow,
  изоляция ошибки чтения; запрещённые роли не запрашивают финансовые строки.
- Production проверен без фиктивных платежей и без создания Auth users. Положительные
  записи через production UI реального владельца не выполнялись; этот предел проверки сохранён явно.

## Реальные оставшиеся работы

#5: возврат денег отдельной операцией, сверка переплаты, финансовая отчётность и общий
раздел финансов. #15: миграционная история и оставшийся source/staging/production parity.
В lifecycle заказа ещё нужны возврат в работу/переделка и сохраняемые документы.
#202/#204: остальные legacy endpoints и direct SELECT требуют поэтапного переноса;
эта поставка не объявляет всю CRM защищённой canonical contract. Дизайн/производство/монтаж
полностью проверены в staging; их production write cutover остаётся отдельным этапом.
Клиентский реестр с редактированием и сохранение документов также остаются в работе.
