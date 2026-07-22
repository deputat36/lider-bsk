# Staging frontend transport монтажа v1

Дата: 22 июля 2026 года.

## Цель

Подготовить браузерный транспорт для одной атомарной команды `installation_job.update`, не переключая рабочую карточку монтажа и не затрагивая production.

## Текущее состояние

- staging schema reconciliation завершён;
- `leader-crm-installation v1` активен и требует JWT;
- RPC доступен только `service_role`;
- runtime user-JWT smoke ещё не выполнен;
- рабочая карточка `installation-job-card-v2.js` пока использует существующий путь сохранения;
- новый transport к карточке не подключён.

## Новые модули

`crm/v4/assets/v4/installation-job-save-route-v1.js`

Определяет маршрут:

- exact staging URL → `staging_edge`;
- любой другой URL, включая production → `production_locked`;
- `browserDirectWrite=false` для нового маршрута;
- production backend считается неразвёрнутым.

`crm/v4/assets/v4/installation-job-staging-transport-v1.js`

Транспорт:

1. Проверяет точный hostname `otulfnouybahfnsycxqn.supabase.co`.
2. Проверяет наличие права на уровне UI-вызова.
3. Получает текущую пользовательскую сессию через `client.auth.getSession()`.
4. Формирует allowlisted команду.
5. Вызывает `client.functions.invoke('leader-crm-installation', { body: command })`.
6. Не выполняет `.from()`, `.insert()`, `.update()`, `.delete()`, `.upsert()` или browser RPC.
7. Не содержит `service_role` и секретов.

## Команда

Envelope:

- `action=installation_job.update`;
- UUID `request_id`;
- `expected_updated_at`;
- `payload.job_id`;
- `payload.idempotency_key`;
- allowlisted `payload.patch`.

Разрешённые поля patch:

- `title`;
- `install_status`;
- `installer_name`;
- `installer_phone`;
- `address`;
- `scheduled_at`;
- `before_photo_url`;
- `after_photo_url`;
- `technical_task`;
- `tools_required`;
- `installer_comment`.

Browser-generated `updated_by`, `updated_at`, status timestamps, order stage и event payload в команду не входят. Их контролирует серверная транзакция.

## Безопасность окружения

Рабочий `config.js` по-прежнему указывает на production `ofewxuqfjhamgerwzull.supabase.co`.

Новый transport fail-closed на:

- production URL;
- похожем поддомене;
- произвольном URL;
- пустом или некорректном URL.

Проверка exact hostname выполняется до чтения сессии и до Edge invoke.

## Тесты

- `tools/test_installation_job_save_route.mjs`;
- `tools/test_installation_job_staging_transport.mjs`;
- `tools/check_crm_staging_installation_frontend_transport.py`;
- `.github/workflows/crm-staging-installation-frontend-transport-check.yml`.

Тесты проверяют production lock, exact hostname, idempotency key, allowlist, отсутствие browser-generated полей, missing session, success/replay и forbidden response.

## Следующий gate

1. Выполнить runtime user-JWT smoke с временными staging JWT.
2. Зафиксировать evidence `401 / 401 / 403 / 404`.
3. Отдельным PR подключить route и transport к карточке только для exact staging URL.
4. Удалить три прямые browser writes только из staging-ветки сохранения.
5. Провести authenticated staging UI smoke с synthetic fixture и cleanup.
6. Production rollout согласовывать отдельно.

Production не изменялся. Supabase в этом этапе использовался только read-only. Figma-файл не изменялся из-за лимита Starter MCP.
