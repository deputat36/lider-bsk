# Production candidate: frontend cutover карточки монтажа

Дата: 23 июля 2026 года  
Репозиторий: `deputat36/lider-bsk`  
Production Supabase: `ofewxuqfjhamgerwzull`

## Статус

`source_only_not_switched`

Рабочие файлы CRM не изменены. Production database, Edge, Auth и данные не менялись.

Кандидат генерируется в отдельный build-каталог и не может включиться сам.

## Источники

Generator:

`tools/generate_crm_installation_production_frontend_candidate.py`

Contract:

`contracts/crm-installation-production-frontend-candidate-v1.json`

Checker:

`tools/check_crm_installation_production_frontend_candidate.py`

Output:

`build/installation-production-frontend-candidate/`

## Почему нужен отдельный пакет

Текущая карточка поддерживает staging Edge, но production пока использует исторический прямой браузерный путь.

Безопасный production cutover требует согласованной замены пяти файлов:

1. route;
2. write transport;
3. read transport;
4. карточка;
5. script loader в `crm/v4/index.html`.

Переключение только route или только loader создало бы ложный доступ либо оставило бы прямые browser writes.

## Exact source baseline

Generator останавливается при изменении любого Git blob:

- route v1 — `64d6137600261d22397ff348f72a60eb908d5d4b`;
- staging write transport — `a4f265fe53c438095ebcbc7b58d22e90e551c057`;
- staging read transport — `b5ebf2a0b05404b639b63b7f8aae27c3574464ce`;
- card v2 — `1c360e08ce954d7879bc075bc203d3fd406db0ae`;
- current index — `404719b0338c4fc6d5c8b0cd5f5b85e06d902973`.

При source drift пакет нужно пересобрать после отдельного review, а не обновлять SHA автоматически.

## Generated outputs

- `crm/v4/assets/v4/installation-job-save-route-v2.js`;
- `crm/v4/assets/v4/installation-job-production-transport-v1.js`;
- `crm/v4/assets/v4/installation-job-production-read-transport-v1.js`;
- `crm/v4/assets/v4/installation-job-card-v3.js`;
- candidate-версия `crm/v4/index.html`;
- `manifest.json`.

Файлы находятся только внутри build artifact. Generator не перезаписывает рабочие пути.

## Route v2

Production Edge разрешается только для exact hostname:

`ofewxuqfjhamgerwzull.supabase.co`

Для любого другого URL:

- mode — `production_locked`;
- browser direct read — false;
- browser direct write — false;
- comment write — false.

Для exact production URL:

- mode — `production_edge`;
- atomic — true;
- browser direct read/write — false;
- комментарии остаются read-only.

## Read path

Action: `installation_job.read`  
Permission: `installation.read`  
Edge slug: `leader-crm-installation`

Карточка получает privacy-safe bundle только через Edge.

Прямые browser `.select()` из installation/order/item/event/comment tables в card v3 отсутствуют.

## Write path

Action: `installation_job.update`  
Permission: `installation.write`  
Edge slug: `leader-crm-installation`

Сохраняются:

- exact PostgreSQL `updated_at` для optimistic concurrency;
- UUID request ID;
- idempotency key;
- patch allowlist;
- read-after-write через server read action.

Прямые browser `.update()`, `.insert()`, `.upsert()`, `.delete()` и `.rpc()` отсутствуют.

## Комментарии

Production Edge v1/v2 не содержит отдельную action для записи комментария монтажа.

Поэтому card v3:

- показывает безопасные комментарии из read projection;
- не отображает форму записи;
- при попытке старого события показывает сообщение о read-only режиме;
- не выполняет browser insert.

Запись комментариев требует отдельного server action и отдельного PR.

## Loader switch

Рабочий `crm/v4/index.html` продолжает загружать:

`installation-job-card-v2.js?v=20260622-1`

Candidate index загружает:

`installation-job-card-v3.js?v=20260723-production-edge-candidate-1`

Само объединение source-кандидата не переключает loader.

## Обязательные зависимости до cutover

1. RBAC/receipts migration применена и postflight пройден.
2. Read RPC применён и postflight пройден.
3. Update RPC применён и postflight пройден.
4. `leader-crm-installation` развёрнут в production с `verify_jwt=true`.
5. Выполнен authenticated production smoke без browser fixture leakage.
6. Проверены security и performance advisors.
7. Доступны database, RPC и Edge rollback packages.
8. Получено отдельное явное разрешение на frontend switch.

До выполнения всех условий loader switch запрещён.

## Будущий порядок cutover

1. Повторить production preflight.
2. Сгенерировать frontend package из актуального `main`.
3. Проверить artifact digest и manifest.
4. Выполнить authenticated production Edge read smoke.
5. Выполнить controlled update/replay/conflict smoke.
6. Зафиксировать отсутствие direct browser requests к installation tables.
7. Применить четыре generated JS-файла.
8. Последним отдельным commit переключить script loader на card v3.
9. Проверить реальную карточку в браузере.
10. Проверить network trace: один Edge read и одна Edge update command.

## Stop conditions

Остановить cutover, если:

- `production_backend_not_ready` — отсутствует хотя бы одна database/Edge dependency;
- `production_edge_verify_jwt_disabled` — функция развёрнута без JWT gate;
- `production_frontend_source_drift` — изменился любой source blob;
- `production_direct_browser_persistence_detected` — card/transport содержит `.from/.update/.insert/.rpc`;
- `production_smoke_not_completed` — нет authenticated read/update evidence;
- `production_loader_approval_missing` — нет отдельного разрешения на loader switch.

## Rollback frontend layer

Frontend rollback не откатывает database или Edge.

Для отката loader:

1. вернуть в `crm/v4/index.html` script `installation-job-card-v2.js?v=20260622-1`;
2. очистить CDN/browser cache marker;
3. подтвердить, что card v3 больше не загружается;
4. generated production files можно оставить неиспользуемыми для диагностики.

Если проблема находится в backend, использовать соответствующий database/RPC/Edge rollback package отдельно.

## Production boundary

- Production database migration не применялась.
- Production Edge не развёртывался.
- Working frontend не переключался.
- Auth и данные не изменялись.
- `nav_*` не изменялся.
- Широкий browser table access не добавлялся.
