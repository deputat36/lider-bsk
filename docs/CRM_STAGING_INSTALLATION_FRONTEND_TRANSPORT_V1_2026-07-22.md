# Staging frontend transport монтажа v2

Дата: 22 июля 2026 года.

## Результат

Карточка монтажа подключена к `leader-crm-installation v2` только на отдельной staging-странице:

`/lider-bsk/crm/v4/staging-installation.html`

Рабочая страница `crm/v4/index.html` и production-карточка `installation-job-card-v2.js` не подключают staging-модули и продолжают использовать прежний production-путь.

## Изоляция окружений

`crm/v4/assets/v4/config.js` выбирает staging только при одновременном совпадении:

- hostname `deputat36.github.io`, `localhost` или `127.0.0.1`;
- pathname `/lider-bsk/crm/v4/staging-installation.html` или локальный `/crm/v4/staging-installation.html`.

Любой другой hostname или путь получает production-конфигурацию:

- Supabase `ofewxuqfjhamgerwzull`;
- storage key `leader_crm_v4_main_session`.

Staging использует отдельные:

- Supabase `otulfnouybahfnsycxqn`;
- browser publishable key;
- storage key `leader_crm_v4_staging_installation_session`.

Publishable key допустим в браузере. Service-role и secret keys в HTML, JavaScript и репозитории отсутствуют.

## Отдельная страница

`crm/v4/staging-installation.html`:

- имеет `noindex,nofollow,noarchive`;
- явно помечена как изолированный staging;
- предупреждает не использовать реальные данные;
- содержит только вход, UUID синтетического задания и безопасную карточку монтажа;
- не загружает заявки, расчёты, КП, заказы, финансы или рабочие production-модули.

`staging-installation-harness-v1.js`:

- повторно проверяет exact host/path до Auth-запроса;
- использует отдельную локальную сессию;
- выполняет `signInWithPassword`, `getSession` и локальный `signOut`;
- не читает таблицу профилей напрямую;
- передаёт UUID карточке, а доступ подтверждает Edge и серверная action matrix.

## Edge чтение и запись

`installation-job-staging-transport-v1.js` обслуживает два действия:

- `installation_job.read` → `installation.read`;
- `installation_job.update` → `installation.write`.

Для обоих действий:

1. Проверяется точный staging Supabase hostname.
2. Получается текущая пользовательская сессия.
3. `supabase.functions.invoke('leader-crm-installation')` отправляет пользовательский JWT.
4. Browser service-role отсутствует.
5. Прямые `.from()`, `.insert()`, `.update()`, `.delete()`, `.upsert()` и `.rpc()` отсутствуют.

Запись дополнительно использует:

- `expected_updated_at`;
- UUID `request_id`;
- idempotency key;
- allowlisted patch;
- read-after-success через тот же Edge.

## Capability projection

Migration:

- version `20260722194950`;
- name `staging_installation_read_capabilities_20260722`;
- source `supabase/staging-migrations/20260722_05_installation_read_capabilities.sql`.

Read RPC теперь возвращает:

```json
{
  "capabilities": {
    "can_read": true,
    "can_write": true
  }
}
```

`can_write` вычисляется сервером через `leader_actor_has_crm_action(..., 'installation.write')`.

В projection не возвращаются роль, email, user ID или полный список действий. Browser не принимает решения по названию роли.

Fingerprint:

- read RPC MD5 `01e91816d4f3a6a1bea2d6cbe760011f`;
- read RPC bytes `5599`;
- write RPC не изменилась: `0ed4669197dac1f2695d0eec54e1`, `19061` bytes.

RPC остаётся `SECURITY INVOKER`, `search_path=''`, EXECUTE только `service_role`.

## Staging-карточка

`installation-job-staging-card-v1.js`:

- читает только safe projection Edge;
- показывает кнопку сохранения только при `capabilities.can_write=true`;
- при отсутствии права переводит форму в режим просмотра;
- не показывает имя или телефон клиента;
- не показывает цены, себестоимость, оплату или прибыль;
- не читает и не создаёт internal comments;
- печатает только безопасный staging-лист;
- не содержит прямых обращений к таблицам.

Неопределённый ответ сервера, неверный UUID, потерянная сессия, forbidden, conflict и network failure обрабатываются fail-closed.

## Production

Production route в `installation-job-save-route-v1.js` называется `production_legacy` и честно описывает существующее поведение:

- `browserDirectWrite=true`;
- атомарный installation Edge в production не включён;
- рабочая `installation-job-card-v2.js` не изменена;
- `crm/v4/index.html` не импортирует staging card или harness.

Это не rollout production. Для production по-прежнему нужны отдельное согласование, backend deployment, migration, rollback и browser smoke.

## Проверки

- `tools/test_installation_job_save_route.mjs`;
- `tools/test_installation_job_staging_transport.mjs`;
- `tools/test_crm_v4_config_routes.mjs`;
- `tools/test_installation_job_staging_card_contract.mjs`;
- `tools/check_crm_staging_installation_frontend_transport.py`;
- `supabase/staging-tests/20260722_installation_frontend_wiring_acceptance.sql`;
- `.github/workflows/crm-staging-installation-frontend-transport-check.yml`.

SQL acceptance создаёт только синтетические строки внутри транзакции и заканчивается `ROLLBACK`.

Подтверждается:

- manager и installer получают `can_write=true`;
- accountant получает `forbidden`;
- sensitive markers не попадают в projection;
- capability object не раскрывает identity/role/action inventory;
- browser EXECUTE закрыт;
- service-role EXECUTE открыт.

## Текущее ограничение

Реальный user-JWT API smoke уже завершён в #438. Исходный код isolated staging UI теперь подключён, но ручное взаимодействие в браузере с временным Auth-пользователем и synthetic fixture в этом PR ещё не выполнено.

Следующий gate:

1. Создать одноразовых staging users и synthetic job.
2. Открыть отдельную staging-страницу в браузере.
3. Проверить manager/installer read-update-reload и accountant deny.
4. Удалить Auth users, profiles, fixtures, events и receipts.
5. Зафиксировать нулевой postflight.

Production Supabase, Auth, Edge Functions, RLS, Storage, рабочие данные и `nav_*` не изменялись.
