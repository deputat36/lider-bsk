# Production data integrity: наблюдения и кандидат #381

Снимок: 2026-09-27. Проверка trigger/rollback и SQL-тест: 2026-09-28.
Production `ofewxuqfjhamgerwzull` использован только для SELECT/introspection.
SQL ниже не применялся к production и не подключён к migration/deploy workflow.

## Подтверждённые результаты

[Воспроизводимый read-only запрос](../tools/sql/leader-data-integrity-readonly.sql) выполняет 20 проверок в read-only transaction. [Evidence](evidence/leader-data-integrity-2026-09-27.json) содержит counts и UUID без имён, телефонов и payload.

| Наблюдение | Строк | Значение |
| --- | ---: | --- |
| Заявка «Создан заказ», заказа нет | 5 | Исторический разрыв #381 |
| Расчёт «Создан заказ», заказа нет | 5 | Тот же исторический набор |
| КП «Согласовано», заказа нет | 5 | Нужна классификация вместе с #381; согласованное КП само по себе не обязано иметь заказ |
| Расчёт без потребности | 8 | Nullable legacy link; не создавать фиктивные потребности |
| Сумма расчёта отличается от суммы позиций | 3 | Проверить исходные документы, не пересчитывать историю автоматически |
| Дубли request_id | 0 | В текущем снимке |
| Подозрительные дубли телефон + услуга за 5 минут | 0 | Эвристика, не доказательство отсутствия всех дублей |
| Прочие проверенные orphan/link/arithmetic случаи | 0 | Ограничено текущими строками и запросами |

Эти числа нельзя суммировать как число уникальных повреждённых сущностей: наборы пересекаются.
В production сейчас 0 заказов, оплат, расходов, дизайн-задач, производственных и монтажных заданий. Нулевые orphan counts не доказывают финансовый workflow на реальных данных.

| Расчёт | Итог | Позиции | Сумма позиций |
| --- | ---: | ---: | ---: |
| `416db14d-894a-468b-b344-1fbf2db72df7` | 4 190 | 0 | 0 |
| `96f07440-a813-4a5c-8a7e-dd2064818a21` | 4 190 | 0 | 0 |
| `0597fdd3-eedb-4192-89ed-8b217e66f281` | 58 400 | 5 | 67 896 |

## Отдельные production / staging ограничения

- RLS включён на проверенных `leader_*` таблицах. Legacy anon INSERT в `leader_leads` и `leader_public_lead_audit` остаётся разрешён политиками. Coordinated public-intake cutover #201/#202/#204 ещё нужен; наличие RLS само по себе не закрывает этот риск.
- Канонические `leader_private.leader_command_receipts`, `leader_private.leader_role_action_matrix_v1` и `public.leader_manage_catalog_rpc(jsonb)` в production отсутствуют. Нельзя включать новые writes frontend раньше backend prerequisites.
- Проверенные существующие accepted audit events имеют совпадающие lead request_id. Это историческая read-only проверка, не новая production-отправка с сайта; #206 остаётся открыт.
- В staging нет `leader_payments` и `leader_expenses`. Пройденный [browser E2E 36335551833](https://github.com/deputat36/lider-bsk/actions/runs/36335551833) доказывает путь до монтажа, не финансовые записи. Финансовая parity и E2E — #5.

## #381: решение до любых изменений

Issue #381 фиксирует cleanup заказов 18.07.2026. По текущим UUID нельзя самостоятельно считать удалённые заказы тестовыми.

1. Если хотя бы часть заказов реальная: не выполнять reset; искать доступный экспорт/backup до удаления, проверять восстановление в отдельном изолированном контуре и готовить точечное восстановление связей. Наличие нужного июльского backup/PITR не подтверждено. Нельзя обещать восстановление на основании самого наличия Supabase.
2. Только если владелец подтвердил весь набор как тестовый: отдельно разрешить reset ровно 15 статусов из [прикреплённого снимка](evidence/leader-status-repair-snapshot-2026-09-27.json). Частичный набор требует нового кандидата и проверки, нельзя просто убрать guard.

[Кандидат](../tools/sql/issue381-status-repair-candidate.sql) меняет только status/updated_at:

| Сущность | До | После |
| --- | --- | --- |
| 5 заявок | Создан заказ | В работе |
| 5 расчётов | Создан заказ | КП сформировано |
| 5 КП | Согласовано | Черновик |

Суммы, позиции, источники, клиенты, потребности и связи не меняются. Новые заказы не создаются.
В существующую `leader_backups` записывается минимальный снимок before/after; `leader_activity_log` получает событие с actor и snapshot_id. Это операционный rollback-снимок, не полноценный backup БД.

## Preflight и порядок применения оператором

1. Получить явное разрешение на конкретный набор и окно работ. Проверить точный production project ref. Никакие приведённые команды не являются разрешением.
2. Повторить read-only запрос и сверить UUID/status/updated_at со снимком. Проверить trigger definitions, особенно `leader_private.leader_guard_historical_offer_status()`. На 28.09 все пять исходных расчётов КП — current revision; trigger запрещает согласовывать историческое КП.
3. Подтвердить свежий доступный backup/export, способ восстановления и ответственного оператора. Экспорт не класть в публичный репозиторий. Для восстановления июльских заказов нужен отдельный источник до удаления.
4. Выбрать действующий owner-профиль для audit actor: их два; скрипт не выбирает произвольного. Использовать привилегированное операторское соединение с остановкой при первой SQL-ошибке, не браузерный Supabase client.
5. В рабочей копии кандидата после BEGIN добавить:

```sql
SET LOCAL lider.repair_approval = '381-test-status-reset-2026-09-27';
SET LOCAL lider.repair_actor = '<подтверждённый UUID действующего owner>';
```

6. Первый согласованный прогон оставить с конечным `ROLLBACK`. Такой dry-run тоже содержит DML и требует production approval. Проверить все 15 изменений внутри транзакции; после ROLLBACK исходные counts должны сохраниться.
7. Для утверждённого применения заменить только последний `ROLLBACK` на `COMMIT` в просмотренной копии. Сохранить выведенный snapshot_id и результат postflight. Не переиспользовать ID откатившегося dry-run.

Без approval marker и активного owner скрипт завершится ошибкой. Изменившиеся counts, UUID/status/updated_at, order links или current revision приводят к abort всей транзакции. Locks удерживают четыре затронутые таблицы; lock_timeout 3 секунды и statement_timeout 30 секунд ограничивают ожидание. Не оставлять транзакцию открытой для длительного ручного изучения.

## Postflight

Повторить `leader-data-integrity-readonly.sql`: первые 5/5/5 status-without-order должны стать 0; восемь need links и три расхождения сумм остаются отдельно. Убедиться, что заказы/финансы не появились и количество бизнес-строк не изменилось.

```sql
BEGIN TRANSACTION READ ONLY;
SELECT b.id, b.created_at, jsonb_array_length(b.data->'rows') AS affected_rows,
       (SELECT count(*) FROM public.leader_activity_log a
        WHERE a.entity_id=b.id::text AND a.action='repair.issue381') AS audit_events
FROM public.leader_backups b
WHERE b.id='<сохранённый snapshot_id>'::uuid
  AND b.data->>'kind'='issue381-status-repair-v1';
ROLLBACK;
```

Ожидается один snapshot, 15 affected_rows, одно apply audit event. После повторного запуска кандидат должен отказать; второй набор изменений и второй snapshot не создаются.

## Реальный rollback

[Rollback SQL](../tools/sql/issue381-status-repair-rollback.sql) использует конкретный snapshot_id, а не текущий git commit. Отдельное разрешение на production DML обязательно.
После BEGIN в просмотренной копии задать:

```sql
SET LOCAL lider.repair_approval = '381-restore-statuses-2026-09-27';
SET LOCAL lider.repair_actor = '<подтверждённый UUID действующего owner>';
SET LOCAL lider.repair_snapshot = '<snapshot_id успешного применения>';
```

Первый согласованный прогон — с ROLLBACK; утверждённый — с COMMIT. Скрипт восстанавливает исходные статусы, фиксирует новое время изменения и отдельный audit event. Он откажет, если после ремонта строка, её order link, исходный расчёт КП или current revision изменились; не перезаписывает новую работу сотрудников и не отключает trigger. После отказа требуется новый согласованный план, а не удаление проверок.

Postflight rollback: 5/5/5 исходных статусов, snapshot содержит `rolled_back_at`, одно `repair.issue381` и одно `rollback.issue381`. Повторный rollback отклоняется. Откат статусов не восстанавливает ранее удалённые заказы.

## Проверки кандидата

`python3 tools/build_issue381_repair_temp_test.py` генерирует тест из реальных DO-блоков apply/rollback с заменой schema на `pg_temp`. Запуск с `psql -v ON_ERROR_STOP=1 -f build/issue381-repair-temp-test.sql` использует только TEMP tables/function/trigger и завершается внешним ROLLBACK.

На staging PostgreSQL 28.09 пройдены: отсутствие approval, неактивный owner, stale apply, current-revision guards, изменение 15 строк + snapshot/audit, duplicate apply, stale rollback, возврат 15 статусов + audit, duplicate rollback. Сценарий добавлен в существующий Docs CI с disposable PostgreSQL, без production credentials.

[Evidence теста](evidence/issue381-repair-test-2026-09-28.json). TEMP fixture моделирует нужные поля и действующий historical-offer guard; это не полная копия production schema/RLS. Production dry-run не выполнялся. Persistent staging строки и Auth users для этого теста не создавались.
