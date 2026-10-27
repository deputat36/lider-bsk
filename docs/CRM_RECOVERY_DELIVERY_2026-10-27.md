# Завершение восстановления — 27.10.2026

Владелец поручил выполнить сохранённый план и итоговый аудит. Все связанные изменения ведутся в PR #596.

## Приём заявки

Actual source Edge проверен локально и в CI: 2000/2001/3000 символов сохраняются целиком; 3001 отклоняется до записи и rate-limit квоты. Есть deadline каждого backend вызова и точный повтор после потерянного ответа. Невалидный JSON/null закрыт. Ключи backend не попадают в браузер.

Staging migration leader_public_intake_runtime_v2 установлена после восстановления среды. Первая попытка вернула Invalid or expired requestState; независимое чтение подтвердило отсутствие config table/RPC/history. Повтор выполнен только после этой проверки и завершился success.

Actual staging leader-public-lead-acceptance v1: проверка staging-public-intake-1793125122632 подтвердила 200/200/200/400 на границах 2000/2001/3000/3001 и duplicate=true на повторе. Cleanup удалил 3 лида/4 audit/3 receipts; независимый SELECT подтвердил 0/0/0. RPC quota/replay/private config проверены внутри BEGIN/ROLLBACK.

Private pepper может находиться в Edge environment или в закрытой service-only конфигурации. Значения salt/ключей не выводились и не сохранялись в source.

## Устойчивость проверок

Восстановлены четыре исторические staging миграции уведомлений. Они уже установлены и не применяются заново. Shared net ACL из исторического пакета не переносится в production без отдельного анализа.

Исправлены два ложных CI отказа: grep сам обнаруживал строку проверки в третьем guard workflow. Запрет автоматического production deploy сохранён. TypeScript проходит реальный strip+syntax, поскольку node --check с TS-файлом не удаляет типы в текущем runtime.

Три затронутых browser jobs используют проверенный образ Playwright 1.55.0 с закреплённым digest. Повторный apt install Chromium/fonts из них удалён; npm package остаётся той же версии. Security/business checks не отключены.

## Граница текущего checkpoint

Production rollout публичного intake, уведомлений, quotes, архива и новых финансовых операций в этом checkpoint ещё не заявляется. Результаты каждого последующего этапа добавляются здесь после native readback и проверки сценария.
