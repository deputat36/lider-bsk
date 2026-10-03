# Очередь дизайна и роли исполнителей

Существующая доска получила очередь дизайн-задач. Дизайнер открывает её первой;
подрядчик видит производство, монтажник — монтаж. Рабочие поля: статус, сроки,
исполнитель, приоритет, ТЗ, ссылки. Чужие финансовые поля и клиентские контакты
не запрашиваются. При смене роли/user строки очищаются, поздний ответ игнорируется.

Local browser: 15 cases, 3 роли × 360/390/768/1024/1440, PASS. Это mock proof.
[Полный authenticated staging 37124020181](https://github.com/deputat36/lider-bsk/actions/runs/37124020181) PASS на SHA `572fdaf`. Проверен входами каждой из трёх ролей, реальными
fixture reads, wrong-role probes, sensitive-column SELECT и service-only RPC denial.
Cleanup PASS; независимый SQL остаток 0; temporary OIDC branch trust удалён.
Отдельно остаётся positive mutation cycle каждой рабочей роли; 404 permission probe
не считать доказательством выполнения работы или завершённого operational cutover.

## Production candidate: только безопасное чтение дизайна

`20261003124938_design_queue_production_read.sql`: private snapshot всего
leader_design_tasks и ACL/RLS, lock, никаких business-row rewrites, canonical
SELECT policy и точная колонная projection. Legacy INSERT/UPDATE браузера отзываются:
production design command UI ранее отключён, репозиторий не содержит direct design
mutations. Три старые политики сохранены; restrictive SELECT не позволяет им обойти
canonical design.read/active profile. Нельзя использовать этот rollout для включения
создания/переходов: RPC/Edge operational candidates ещё не перенесены.

`leader_design_read_stop_rollback.sql`: отключить frontend gate, остановить SELECT
без удаления строк/истории и без возврата небезопасного legacy доступа. Выполнение
REVOKE проверяется в BEGIN/ROLLBACK до rollout. Private backup — только postgres;
не выгружать строки или старые ACL в публичные artifacts. Auth/Storage не меняются.

Перед apply: fresh production preflight, успешный staging worker proof, проверка
безопасной projection. После apply: неизменность полного snapshot, отсутствие
browser DML/PII SELECT, advisor, frontend gate и опубликованный importmap.
