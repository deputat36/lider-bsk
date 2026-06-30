# Дополнение к Static checks: cache-marker CRM selfcheck

Дата: 2026-06-30.

Фокус: только CRM РА «Лидер».

## Что изменилось

После обновления CRM-самопроверки блок `Аудит request_id` должен загружаться через новый cache-marker:

- `crm-ui-selfcheck-v1.js?v=20260630-selfcheck-1`.

Старый marker больше не должен использоваться как реальный import:

- `crm-ui-selfcheck-v1.js?v=20260627-access-route-1`.

## Что проверяет CRM selfcheck

В самопроверке CRM должен быть блок `Аудит request_id`.

Он проверяет:

- вкладку `Аудит заявок`;
- секцию аудита;
- `Trace helper`;
- форму `Проверить request_id`;
- `Summary addon`;
- кнопку `Проверить цепочку` после загрузки audit-событий.

## Что проверяет CI

`CRM selfcheck cache check` проверяет:

- реальный import `crm-ui-selfcheck-v1.js?v=20260630-selfcheck-1` в `site-cache-note-v1.js`;
- наличие блока `Аудит request_id` в `crm-ui-selfcheck-v1.js`;
- наличие `checkAuditTools`;
- наличие проверки `Summary addon`.

`Static checks` должен проверять тот же актуальный selfcheck-marker и не должен зависеть от старого compatibility-комментария.

## Ручная проверка

1. Открыть CRM v4.
2. Нажать Ctrl + F5.
3. Открыть блок `Проверка загруженных разделов и доступа CRM`.
4. Проверить, что появился раздел `Аудит request_id`.
5. Открыть `Аудит заявок`.
6. Нажать `Обновить аудит`.
7. Вернуться в самопроверку и убедиться, что `Trace helper`, `Форма request_id` и `Summary addon` загружены.
