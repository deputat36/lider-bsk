# Staging frontend transport монтажа v2

Дата: 22 июля 2026 года.

## Цель

Подключить рабочую карточку монтажа к защищённому `leader-crm-installation v2` только на exact staging URL. Production должен сохранить существующее браузерное поведение до отдельного rollout.

## Подтверждённые prerequisites

- staging schema reconciliation завершён;
- `leader-crm-installation v2` активен;
- `verify_jwt=true`;
- Edge SHA-256: `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`;
- действия `installation_job.read` и `installation_job.update` доступны через canonical permission matrix;
- runtime user-JWT smoke завершён;
- проверены `401`, `403`, `200`, `201` и idempotent replay `200`;
- временные Auth-пользователи, профили, jobs, events и receipts очищены.

## Маршрутизация

`crm/v4/assets/v4/installation-job-save-route-v1.js` определяет новый серверный маршрут:

- exact staging URL `https://otulfnouybahfnsycxqn.supabase.co` → `staging_edge`;
- любой другой URL → новый Edge-маршрут `production_locked`;
- похожие поддомены не считаются staging;
- production Edge rollout не выполнялся.

Рабочий `crm/v4/assets/v4/config.js` по-прежнему указывает на production `ofewxuqfjhamgerwzull.supabase.co`. Поэтому обычный production-интерфейс продолжает существующий прямой путь чтения и сохранения.

## Staging-чтение

`crm/v4/assets/v4/installation-job-staging-read-transport-v1.js`:

1. Проверяет exact staging hostname до чтения сессии.
2. Получает текущий user JWT через `client.auth.getSession()`.
3. Вызывает `leader-crm-installation` с `action=installation_job.read`.
4. Требует canonical permission `installation.read`.
5. Преобразует privacy-safe Edge projection в bundle карточки.
6. Не выполняет browser `.from()`, `.select()` или `.rpc()`.

Staging bundle включает только безопасные данные job, order, production, items, events и comments. Клиентские контакты, финансовые поля, внутренние комментарии, `order.data` и server-owned actor fields не возвращаются.

## Staging-сохранение

`crm/v4/assets/v4/installation-job-staging-transport-v1.js`:

1. Проверяет exact staging hostname до чтения сессии и Edge invoke.
2. Получает user JWT.
3. Формирует allowlisted `installation_job.update` command.
4. Передаёт `request_id`, `expected_updated_at` и `idempotency_key`.
5. Вызывает одну атомарную Edge-команду.
6. После успеха перечитывает карточку через staging read transport.

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

Browser-generated `updated_by`, `updated_at`, status timestamps, order stage и event payload в staging-команду не входят. Их формирует транзакционный RPC.

## Изменения карточки

`crm/v4/assets/v4/installation-job-card-v2.js` теперь выбирает путь по `V4_CONFIG.supabaseUrl`.

Exact staging:

- чтение — `installation_job.read` через Edge;
- сохранение — `installation_job.update` через Edge;
- прямые browser writes не выполняются;
- финансовые поля не отображаются;
- комментарии доступны только для чтения до отдельной server action;
- кнопка сообщает, что сохранение выполняется в staging;
- после сохранения используется server read-back.

Production:

- прямые browser reads/writes сохранены без изменения;
- production Edge route остаётся заблокирован;
- конфигурация, Supabase и данные production не менялись.

## Ошибки и конкуренция

UI обрабатывает:

- missing session;
- forbidden;
- not found;
- validation error;
- optimistic concurrency conflict;
- invalid status transition;
- duplicate request;
- network error;
- idempotent replay.

При конфликте пользователь должен перечитать карточку и повторить действие с новым `expected_updated_at`.

## Проверки

- `tools/test_installation_job_save_route.mjs`;
- `tools/test_installation_job_staging_transport.mjs`;
- `tools/test_installation_job_staging_read_transport.mjs`;
- `tools/check_crm_staging_installation_frontend_transport.py`;
- `.github/workflows/crm-staging-installation-frontend-transport-check.yml`.

CI проверяет exact hostname, production lock, отсутствие секретов, read/write action contracts, allowlist, исключение server-owned полей, imports карточки, server read-back и сохранение production fallback.

## Следующий gate

1. Запустить authenticated staging UI smoke на synthetic fixture.
2. Проверить открытие карточки через Edge read.
3. Изменить статус и поля через одну Edge update-команду.
4. Подтвердить одну запись event и один completed receipt.
5. Проверить exact replay без дубликатов.
6. Полностью удалить synthetic fixture, profile, Auth user и receipts.
7. Production rollout согласовывать отдельно.

Production не изменялся. Supabase в этом PR не изменяется. Figma-файл не изменяется из-за лимита Starter MCP.
