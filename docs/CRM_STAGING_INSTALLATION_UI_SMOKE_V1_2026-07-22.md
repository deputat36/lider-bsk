# Authenticated staging UI smoke карточки монтажа v1

Дата: 22 июля 2026 года.

## Назначение

Проверить в headless Chrome реальную `installation-job-card-v2.js` после подключения exact-staging Edge read/write.

Runner не создаёт пользователей, профили, заказы или монтажные задания. Он работает только с заранее созданными одноразовыми staging fixtures и после выполнения требует внешнюю очистку этих fixtures.

## Что уже подтверждено

- `leader-crm-installation v2` активен;
- `verify_jwt=true`;
- runtime user-JWT smoke завершён;
- карточка монтажа подключена к `installation_job.read` и `installation_job.update` только на exact staging URL;
- production сохраняет прежний browser read/write путь;
- staging postflight после wiring: Auth users, profiles, jobs, items, events, comments и receipts — по 0.

## Безопасная архитектура runner

Файл:

`tools/run_crm_staging_installation_ui_smoke.mjs`

Runner:

1. Проверяет точный URL `https://otulfnouybahfnsycxqn.supabase.co`.
2. Блокирует production и похожие hostname.
3. Требует явную фразу `YES_USE_EXISTING_SYNTHETIC_FIXTURES`.
4. Копирует `crm/v4` в системную временную директорию.
5. Подменяет `config.js` только внутри временной копии.
6. Записывает email, пароль и job UUID только во временный runtime-модуль с правами `0600`.
7. Запускает локальный HTTP-сервер только на `127.0.0.1`.
8. Открывает временную страницу в headless Chrome или Chromium.
9. Импортирует реальную `installation-job-card-v2.js` из временной копии.
10. После завершения выполняет локальный logout.
11. В `finally` останавливает сервер и удаляет всю временную директорию.

Production `crm/v4/assets/v4/config.js` не изменяется.

## Runtime-входы

Обязательные переменные окружения:

- `STAGING_SUPABASE_URL`;
- `STAGING_SUPABASE_PUBLISHABLE_KEY`;
- `STAGING_INSTALLATION_UI_EMAIL`;
- `STAGING_INSTALLATION_UI_PASSWORD`;
- `STAGING_INSTALLATION_UI_JOB_ID`;
- `STAGING_INSTALLATION_UI_SMOKE_CONFIRM=YES_USE_EXISTING_SYNTHETIC_FIXTURES`.

Дополнительные:

- `STAGING_INSTALLATION_UI_ROLE`, по умолчанию `installer`;
- `STAGING_INSTALLATION_UI_EXPECTED_STATUS`, по умолчанию `Запланирован`;
- `STAGING_INSTALLATION_UI_TITLE_SUFFIX`, по умолчанию ` · UI smoke`;
- `STAGING_INSTALLATION_UI_EVIDENCE_PATH`;
- `CHROME_BIN`.

Разрешённые UI-роли:

- `installer`;
- `manager`;
- `admin`;
- `owner`.

`accountant` запрещён, потому что не имеет `installation.read/write`.

## Plan-режим

Plan-режим не требует секретов и не обращается к Supabase:

```bash
node tools/run_crm_staging_installation_ui_smoke.mjs --mode=plan
```

Он показывает:

- exact staging boundary;
- наличие runtime inputs без вывода значений;
- ожидаемое число мутаций — 1;
- отсутствие screenshot-run;
- необходимость внешнего fixture lifecycle.

## Run-режим

Пример запуска с переменными окружения:

```bash
STAGING_SUPABASE_URL='https://otulfnouybahfnsycxqn.supabase.co' \
STAGING_SUPABASE_PUBLISHABLE_KEY='runtime-value' \
STAGING_INSTALLATION_UI_EMAIL='runtime-value' \
STAGING_INSTALLATION_UI_PASSWORD='runtime-value' \
STAGING_INSTALLATION_UI_JOB_ID='00000000-0000-4000-8000-000000000000' \
STAGING_INSTALLATION_UI_ROLE='installer' \
STAGING_INSTALLATION_UI_EXPECTED_STATUS='Запланирован' \
STAGING_INSTALLATION_UI_SMOKE_CONFIRM='YES_USE_EXISTING_SYNTHETIC_FIXTURES' \
node tools/run_crm_staging_installation_ui_smoke.mjs --mode=run
```

Значения в примере — placeholders. Реальные credentials нельзя сохранять в shell history, документации, issue, PR, Actions artifact или репозитории.

## Проверяемый пользовательский путь

Страница:

1. Входит через `supabaseClient.auth.signInWithPassword()`.
2. Устанавливает локальное UI-состояние роли одноразового пользователя.
3. Нажимает реальный элемент `data-open-installation-job-card`.
4. Ждёт появления `installJobTitle`.
5. Проверяет staging Edge notice.
6. Проверяет отсутствие финансовых блоков.
7. Проверяет read-only комментарии и отсутствие кнопки добавления.
8. Проверяет ожидаемый начальный статус.
9. Меняет только название задания.
10. Нажимает реальную кнопку `data-save-installation-job`.
11. Ждёт успешного server read-back.
12. Проверяет новое название после перерисовки карточки.
13. Выполняет logout.

Весь путь выполняет ровно одну update-мутацию.

## Почему автоматический скриншот отключён

Отдельный screenshot-запуск снова открыл бы страницу и мог повторно сохранить задание. Поэтому `screenshot_run_enabled=false`.

Визуальный снимок допускается отдельным read-only инструментом только после появления специального review-режима, который физически не вызывает update.

## Evidence

По умолчанию создаётся:

`artifacts/installation-staging-ui-smoke/evidence.json`

Права файла — `0600`.

Evidence не содержит:

- email;
- пароль;
- JWT;
- authorization headers;
- API keys;
- телефоны;
- клиентские данные;
- финансовые поля;
- комментарии.

Ожидаемые признаки успеха:

- `status=passed`;
- `authenticated=true`;
- `edge_notice=true`;
- `privacy_projection=true`;
- `comments_read_only=true`;
- `update_via_edge=true`;
- `server_read_back=true`;
- `mutation_count=1`.

## Внешний fixture lifecycle

До запуска должны существовать:

- временный Auth user;
- активный `leader_user_profiles` с разрешённой ролью;
- synthetic order;
- synthetic production job при необходимости;
- synthetic installation job со статусом `Запланирован`.

После запуска обязательна очистка:

- Auth user;
- profile;
- order;
- production job;
- installation job;
- items;
- events;
- comments;
- command receipts.

Postflight должен подтвердить нулевые значения всех этих счётчиков.

## Тесты

- `tools/test_crm_staging_installation_ui_smoke.mjs`;
- `tools/check_crm_staging_installation_ui_smoke.py`;
- `.github/workflows/crm-staging-installation-ui-smoke-check.yml`.

CI запускает только syntax/unit/contract checks. Реальный UI smoke в GitHub Actions не выполняется, потому что credentials и server fixtures намеренно отсутствуют.

## Текущее состояние

- source готов;
- unit tests подготовлены;
- runtime UI smoke ещё не выполнен;
- server fixtures не создавались;
- Supabase в этом PR не изменяется;
- production не изменяется;
- Figma не изменяется из-за лимита Starter MCP.
