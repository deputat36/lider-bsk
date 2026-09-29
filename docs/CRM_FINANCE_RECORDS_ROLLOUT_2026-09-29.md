# Финансовые записи заказа — #5 / PR562

Состояние PR562: production Supabase не изменялся. Запись включена только для staging
`otulfnouybahfnsycxqn`; рабочий frontend остаётся в режиме чтения финансов.

## Что реализовано

- В одной карточке: приход, расход, категория, способ, фактическая дата,
  комментарий; отмена с обязательной причиной и подтверждением сохраняет строку.
- Главные показатели: поступления, долг, подтверждённые расходы, денежный результат.
  Полный план/факт раскрывается отдельно. Отсутствие расходов не означает нулевую
  себестоимость; результат не объявляется окончательной прибылью.
- Копейки сохраняются. Нулевая цена/прибыль не подменяется старым значением.
  Читаются все страницы записей, а не первые 80. Ошибка чтения не показывает ложный
  нулевой долг и не закрывает остальную карточку.
- `finance.write` — owner/admin/accountant; `finance.read` управляет чтением и UI.
  Manager не получает финансовые строки. Права ролей не расширены.
- Новый `leader-crm-finance` проверяет JWT через Auth и актуальный canonical action.
  Service-only `leader_write_finance_rpc` повторяет проверку активного профиля/роли,
  валидирует сумму/дату/категории, блокирует устаревшую версию заказа/записи,
  атомарно меняет запись, проекцию долга, audit и canonical receipt.
- Потерянный ответ повторяется с прежним request ID и исходной revision. В
  sessionStorage находятся только digest/технические ID; суммы и комментарии не
  сохраняются. После неизвестного результата поля заблокированы до разрешения
  повтора. Новый сознательный ввод после успешного завершения получает новый ID.
- Отмена — отдельная команда `finance.record.void`; это не общее разрешение менять
  terminal-статусы `payment_record`. Сумма и исходный комментарий сохраняются,
  причина попадает в audit. Физического удаления в UI нет.
- Карточка staging читает заказ/позиции через `leader-crm-orders`, `action: get`.
  Это расширение существующего canonical wrapper. Прямые ограничения таблиц не
  ослаблены; стоимость/финансы/данные клиента включаются только по правам.

Staging таблицы оплат/расходов созданы по production metadata. `leader_contractors`
там отсутствует, поэтому FK `contractor_id` не воспроизведён; форма его не пишет.
Общий synthetic lifecycle дополнен реальным удалением финансовых строк, audit и
receipts перед удалением заказа, с проверкой остатка и Auth cleanup.

## Проверки и доказательства

- `tools/test_finance_records.mjs`: числа/даты, 1234 строки и ошибка второй страницы,
  нулевая цена, копейки, потерянный ответ, повтор и отказ production URL.
- `tools/test_order_detail_read.mjs`: минимизация полей по canonical permissions.
- `tools/build_finance_rpc_test.py`: фактический SQL в disposable PostgreSQL 17;
  owner/admin/accountant, запреты manager/designer/installer/contractor и inactive,
  replay/conflict/stale, отмена, проекция долга и полный откат при отказе audit.
- `tools/test_finance_record_browser.mjs`: изолированный UI реальной карточки на
  360/390/768/1024/1440; axe WCAG A/AA, overflow, Escape/focus, финансовый read failure
  и отсутствие финансовых запросов у manager. Скриншоты 360/1440 проверены.
- Полный authenticated staging E2E [36520188081](https://github.com/deputat36/lider-bsk/actions/runs/36520188081)
  на `6eed928` PASS: manager workflow, owner financial UI, lost-response replay,
  expense, audited void; повторная проверка manager скрывает реальные synthetic
  деньги. 22 категории cleanup = 0, Auth удалён; независимый SELECT подтвердил
  нулевые orders/payments/expenses и synthetic users/profiles. Временная ветка
  удалена из OIDC allowlist bootstrap v22 после проверки.
- На runtime-head прошли все 60 GitHub workflows. PostgreSQL 17 проверил атомарность
  фактического SQL, включая полный rollback при искусственном отказе audit.
- Lazy boot сохранён: 11 eager entrypoints. Новые UI-модули загружаются с заказами.
- Security advisors: новых замечаний по платежам/расходам/финансовому RPC нет.
  Остальные notices staging не считаются закрытыми этой работой.

## Production: точные ограничения

Read-only metadata от 28–29.09: production `leader_payments`/`leader_expenses` имеют
ALL-policy для любого активного профиля (`leader_has_access`). Это реальный пробел
server-side прав #202, который UI не исправляет. Единственный обнаруженный RPC,
читающий эти таблицы, `leader_finance_summary`, SECURITY INVOKER; скрытых
SECURITY DEFINER financial write RPC при этой проверке не найдено.
Canonical matrix/receipts prerequisites ещё не развернуты в production (#204).

`python3 tools/generate_crm_finance_production_candidate.py` создаёт в
`build/crm-finance-production-candidate`:

- `finance-apply.sql`: preflight, защита от изменившихся grants/policies, узкие
  SELECT-права, защита финансового audit и тот же бизнес-RPC, что проверен в staging.
- `finance-postflight.sql`: права RPC/DML, RLS, orphan links, duplicate receipts.
- `finance-stop-rollback.sql`: останов нового write path без удаления денег/audit.
- Edge candidate с точным production host; `verify_jwt=true` обязательно.
- Manifest с hash общего RPC. Генератор не подключается к базе.

SQL по умолчанию заканчивается ROLLBACK и требует отдельного approval marker.
В пакете **нет включения production frontend**, общей миграции #204 или замены
production orders Edge. Общий cutover должен также закрыть старые обходные пути
изменения финансовых полей заказа; текущий finance-пакет не объявляет их закрытыми.

## Порядок production-включения (разрешено владельцем 29.09.2026)

1. Разрешение владельца от 29.09 распространяется на необходимые изменения
   production `ofewxuqfjhamgerwzull` в контуре `leader_*` / `leader-*`. Подготовить
   общий canonical RBAC/receipts rollout #202/#204 и защитить legacy order updates.
2. До DDL: актуальные schema/ACL/RLS/functions dumps, backup orders/payments/expenses/
   activity_log/receipts вне репозитория; проверить восстановление в изолированной
   базе. Наличие PITR не предполагается без проверки плана и доступной точки.
3. Проверить expected schema/policies/roles и отсутствие другого finance RPC.
   Зафиксировать row counts, sums и связанные order projections до cutover.
4. Применить проверенный SQL, выполнить read-only postflight, развернуть
   finance Edge с JWT. Проверить роли и read path. Не создавать фиктивные рабочие оплаты; positive proof выполняется в staging.
5. Только после подтверждения backend smoke включить frontend write route отдельным
   проверенным изменением. Staging `order.get` не переносить автоматически.
6. При отказе сначала закрыть UI writes, затем проверенным stop-rollback удалить
   только новый RPC. Сохранить деньги, проекции, audit и receipts для сверки.
   Усиленную RLS сохранять: откат к прежней широкой ALL-policy небезопасен.
   Возврат данных из backup — отдельный incident plan, не массовое удаление новых
   операций. Сверить counts/sums/links и запреты новых вызовов.

## Реальные следующие задачи

Общий production cutover; отчёт владельца по всей базе без усечения portfolio
query; явный признак завершённости расходов/сверки; отдельный сценарий возврата
денег клиенту. Этот проход реализует приход, расход и отмену ошибочной записи,
а не бухгалтерский учёт или фискализацию. #5 остаётся открытым до production proof.

## Операционная граница следующего этапа

Новая инструкция владельца требует действующих production-команд. Staging PASS
не означает доступность для сотрудника. Подтверждён deployed orders Edge v2:
проверяет только active profile, произвольно PATCH-ит status/payment/layout/production
без canonical permission, истории и transition guard. До включения финансов
нужно закрыть этот обход, сохранить backend snapshot и проверить новые команды.

При удалении временного branch trust ошибочно был создан дополнительный staging
slug `leader-crm-staging-bootstrap`. Он немедленно заменён на неактивный обработчик
404 с verify_jwt=true (v2): нет доступа к DB/Auth и нет synthetic данных. Рабочий
bootstrap `leader-staging-authenticated-e2e-bootstrap` восстановлен отдельно.
