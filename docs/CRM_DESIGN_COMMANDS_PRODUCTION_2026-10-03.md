# Дизайн: создание и согласование

Существующий путь заказ → подтверждённая потребность → дизайн-задача сохранён.
Нет второго каталога, direct browser writes, нового workflow или новой CRM.

## Что установлено

Production `ofewxuqfjhamgerwzull`: migration `design_commands_production_v1`
(source `20261003134047_design_commands_production_v1.sql`) и JWT Edge
`leader-crm-design` v1. Canonical source Edge bundle:
`supabase/production-candidates/functions/leader-crm-design/index.ts`.
Исторический `supabase/functions/leader-crm-design` описывает июльский staging;
не использовать его для production deploy. Текущий единый bundle принимает только
создание и переход дизайн-задачи в двух точных Leader окружениях.
Общий RBAC/receipts core не переустанавливался, Auth/Storage не менялись.

Fresh production preflight: 2 заказа, 0 задач/событий/дизайн receipts; команды
отсутствовали. Существующие заказы считаются реальными, не менялись для proof.
Атомарный закрытый backup `design-commands-20261003-v1` содержит полные строки
заказов/задач/событий и исходные ACL. Postflight: snapshot unchanged; browser DML
и RPC EXECUTE закрыты; service_role EXECUTE открыт; безопасное чтение сохранено.
Security advisor не содержит findings для двух новых команд.

## Контракт и защита

Auth user определяется сервером; canonical fresh active profile проверяется Edge
и RPC. Сотрудник не может подставить actor или финансовые поля. RPC — SECURITY
INVOKER с пустым search_path, доступен только service_role. Создание сохраняет
task/event/receipt атомарно, проверяет need evidence/заказ/активный дубль. Receipt
привязан к actor и содержимому; новый request_id при retry возвращает ту же задачу.
Изменение actor/payload — conflict. Переходы строго проверяют envelope/payload,
исходную revision, статус, закрытый/архивный заказ и HTTP(S) ссылку без credentials.
Lock order согласован: order → task. Ответы не содержат контактов или финансов.

## Доказательства

- Staging `design_commands_operational_v1`: synthetic DB proof в ROLLBACK — создание,
  retry с новым request_id, cross-actor/content conflict, canonical wrong role и
  inactive profile, positive mutation дизайнера, строгие поля, privacy/audit/ACL.
- Полный [authenticated staging 37127188581](https://github.com/deputat36/lider-bsk/actions/runs/37127188581)
  SUCCESS на `6aa6a7c`: manager/owner браузерный цикл до закрытия заказа и worker
  reads/UI/API. Команда дизайна вызвана через новый Edge. После cleanup независимый
  SQL: tasks/events/orders/profiles/Auth/receipts/payments/expenses/jobs = 0.
  Временное OIDC доверие ветки удалено; bootstrap восстановлен v32.
- Disposable PostgreSQL CI на `dbde9db`: точный production candidate, snapshot/ACL,
  команды/роль дизайнера/retry/privacy/audit и stop rollback PASS. Исправлена изоляция:
  существующий read rollout test, который намеренно COMMIT-ит, выполняется последним.
- Local browser: очередь — 15 случаев; действия дизайнера — 5 ширин
  360/390/768/1024/1440, начало/двойной submit/unsafe URL/conflict/revision/review/focus;
  согласование менеджера — 5 ширин, явная ссылка/checkbox/сохранение ввода/клавиатура.
  Это mock proof, не authenticated production или positive worker browser mutation.
- Delta после полного E2E: gated production delivery, минимизация технического UI,
  отдельные queue actions и error parsing. Покрыта targeted браузерными проверками;
  весь прежний E2E не повторялся автоматически.

## Rollback / восстановление

`leader_design_commands_stop_rollback.sql`: выключить frontend gate; отозвать
service_role EXECUTE двух RPC. Сохраняются все строки, история, receipts и queue READ.
Unsafe legacy browser writes не возвращаются. Actual REVOKE двух RPC проверен в
production BEGIN/ROLLBACK: оба EXECUTE остановились и восстановились после rollback.
Edge без работающей RPC возвращает безопасную ошибку; ручное удаление Edge не нужно.
После исправления: актуальный staging proof/CI, проверка snapshot/ACL, restore
service_role EXECUTE только двух RPC и повторное включение frontend gate.
Нельзя считать откат git-коммита откатом БД или восстанавливать старые строки поверх
новых законных действий сотрудников.

## Ограничения и следующий этап

Frontend даёт менеджеру создание/переходы из заказа, дизайнеру начало работы и
передачу ссылки из очереди. Решение клиента подтверждается явным действием в
карточке дизайна менеджера. Production authenticated positive mutation/UI proof
пока не выполнен: browser session не авторизована, реальные заказы не использовались
для тестов. Positive worker API/browser cycle отдельно от manager proof остаётся.
Назначение дизайнера, возврат на правки и операционные команды производства/монтажа
ещё требуют завершения. Исторические цепочки #381 не ремонтировались.
