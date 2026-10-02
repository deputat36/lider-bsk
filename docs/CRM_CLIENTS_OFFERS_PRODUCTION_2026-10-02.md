# Клиенты и переход КП → заказ

PR564, разрешение владельца подтверждено 02.10.2026. Production `ofewxuqfjhamgerwzull`.

## Поведение

Реестр клиентов: поиск по имени/телефону, создание/редактирование, ссылки на заявки
и заказы, история изменённых полей. Нормализация телефона защищает от дубля;
конфликт ревизии требует обновления. Неизвестный результат сохраняет ключ повтора.

Карточка КП: «Отметить отправку» → «Клиент согласовал» → форма создания заказа.
Смена статуса атомарно обновляет КП, расчёт и заявку, сохраняет событие и receipt.
При созданном заказе показывается переход к нему. Форма появляется по завершении
загрузки карточки; фиксированная задержка 900 мс удалена. Escape возвращает фокус.
Используется прежний `create_order_from_offer`, второй способ создания не введён.

## Доказательства

- Client registry PostgreSQL17/RLS и исправленные access checks: commit `8c5ee24` PASS.
- [Staging 37067332615](https://github.com/deputat36/lider-bsk/actions/runs/37067332615): клиенты,
  потеря ответа/retry, поиск, edit, duplicate/stale/direct API guards PASS.
- [Staging 37068003199](https://github.com/deputat36/lider-bsk/actions/runs/37068003199):
  создание/печать КП с privacy, новые действия карточки, заказ, дизайн, производство,
  монтаж, финансы/закрытие, manager/owner UI/API PASS. Cleanup 24/24=0, Auth удалён.
- Независимый SQL: staging clients/orders/profiles/Auth/client audit = 0.
- Локальный Chromium: 360/390/768/1024/1440, загрузка 1300 мс, согласование → форма,
  один блок создания, overflow=0, JS errors=0, Escape/focus PASS.
- Временная ветка удалена из OIDC bootstrap и dispatch. Bootstrap восстановлен из
  исходного сохранённого файла, deploy v26. Старая функция создания КП восстановлена
  из version-controlled source (deploy v8), её путь и privacy повторно прошли E2E.

## Production и rollback

Применён `20261002214156_leader_clients_offers_production.sql`: shared staging RPC,
canonical read policy, запрет browser client DML и подделки client audit.
Edge `leader-crm-clients` v1 и `leader-crm-offer-transitions` v1, verify_jwt=true;
использованы те же файлы, что проверялись в staging. Прежние production Edge не заменены.
Frontend gates включаются только после backend postflight.

До изменений в закрытой таблице `leader_private.leader_rollout_backups` сохранён
snapshot `clients-offers-20261002-v1`: полные строки шести затрагиваемых таблиц,
ACL/RLS/column grants и факт отсутствия новых функций/Edge. Данные не экспортированы.
Сравнение полных строк внутри migration и отдельный postflight подтвердили неизменность.
16 клиентов, 14 КП, 1 заказ остались на месте; реальные записи не редактировались.

Stop rollback: выключить два frontend gate и выполнить
`supabase/production-candidates/leader_clients_offers_stop_rollback.sql`.
REVOKE EXECUTE действительно блокирует новые RPC; проверено внутри BEGIN/ROLLBACK.
После проверки grants восстановлены. Этот останов сохраняет данные, receipts и audit;
не возвращает небезопасные browser writes. При исправлении данных использовать snapshot
и последующий audit, не заменять таблицы целиком. Postflight находится рядом с migration.

Security advisors: новых Leader security findings нет. Performance: новый неиспользованный
индекс ожидаем до начала работы; дополнительная permissive read policy дублирует старую
ALL policy на production, но ограничена тем же canonical restrictive guard. Это не
расширяет доступ; политика нужна и на чистой staging-схеме без старой ALL policy.
Другие приложения и `nav_*`, Auth/Storage настройки не изменены.

## Предел проверки

Production проверен без фиктивных заявок/денег и без создания Auth users.
Положительный authenticated UI workflow доказан в staging; запись от имени реального
владельца в production не выполнялась. Публикация frontend/Pages проверяется после merge.
Исторические пять разрывов #381 не исправлялись автоматически; production cutover
дизайна/производства/монтажа, возвраты и общий финансовый раздел — следующие этапы.
