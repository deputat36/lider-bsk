# Staging deploy design Edge Function — 2026-07-13

## Окружения

- Production: `ofewxuqfjhamgerwzull`.
- Staging: `otulfnouybahfnsycxqn`.
- Organization: `Lider` / `tcbupmmcojrcxfqjuwsm`.
- Deploy выполнялся только в staging.

## GitHub

Source PR: #279.

- PR head: `29bf8870ca3320738c523a36d3f2d27be794a230`;
- merge commit: `9a4fc292e4aa472d521d0603b75ad5689f34f671`;
- все 19 PR workflows завершились успешно;
- `CRM design Edge check` подтвердил Deno type-check, behavior tests и staging/JWT/RPC-only boundary;
- post-merge workflow runs connector не вернул, поэтому main-push Actions отдельно не подтверждены.

## Deploy

Функция:

- slug: `leader-crm-design`;
- version: `1`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- deployment hash: `3a80d01ad9b9936158c0d9fec184b96930e0c983d613708f0ffb8edfc0c3e8bb`.

Функция жёстко привязана к staging project ref. При другом `SUPABASE_URL` source возвращает `503 wrong_environment` до проверки профиля и RPC.

## Database state после deploy

Staging:

- environment guard rows — 1;
- profiles — 0;
- orders — 0;
- needs — 0;
- design tasks — 0;
- design events — 0;
- command receipts — 0;
- transaction RPC присутствует.

Edge deploy не создал business rows и не вызвал design RPC.

Production:

- `leader-crm-design` отсутствует;
- production Edge versions не изменились;
- target design RPC отсутствует;
- receipt table отсутствует;
- active-task unique index отсутствует;
- design tasks/events/comments — 0.

## Advisors

После deploy в staging:

- security WARN/ERROR — 0;
- остаются только INFO `RLS Enabled No Policy` для закрытых browser roles таблиц;
- performance WARN/ERROR — 0;
- остаются только INFO `Unused Index` для пустых staging-таблиц.

## Smoke status

Доказано:

- Supabase deployment status `ACTIVE`;
- `verify_jwt=true`;
- database counters не изменились;
- Edge logs пусты до первого успешного обращения.

Не доказано в текущем этапе:

- внешний unauthenticated HTTP smoke: runtime текущей рабочей среды не смог разрешить staging DNS;
- authenticated positive E2E: в staging ещё нет отдельного Auth user и active CRM profile.

Эти пункты нельзя считать пройденными. Для positive E2E требуется отдельно создать синтетического staging Auth user, связать только staging-профиль, выполнить create/replay/cleanup и удалить тестовую учётную запись. Production Auth не используется.

## Production boundary

Не выполнялись:

- production deploy;
- production DDL/DML;
- production RPC/RLS/grant changes;
- production backfill;
- копирование production data или Auth users в staging.

Следующий gate — отдельное разрешение на создание временного синтетического Auth user только в staging либо ручной browser smoke владельцем проекта.
