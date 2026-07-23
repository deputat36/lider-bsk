# P0 evidence production rollout монтажа

Issue #456.

Статус: `P0` пройден, `P1` не одобрен и не выполнялся.

## Что проверено

Production project:

`ofewxuqfjhamgerwzull`

Read-only preflight подтвердил:

- профили: 4;
- роли: `owner=2`, `admin=1`, `manager=1`;
- неизвестные роли отсутствуют;
- заказы: 0;
- монтажные задания: 0;
- позиции монтажа: 0;
- события монтажа: 0;
- комментарии монтажа: 0;
- все 73 поля, которые требует production RPC generator, присутствуют;
- `leader_staging.environment_guard` отсутствует;
- canonical RBAC matrix отсутствует;
- durable command receipts отсутствуют;
- actor permission function/RPC отсутствуют;
- installation read/update RPC отсутствуют;
- `leader-crm-installation` Edge отсутствует;
- рабочий loader продолжает загружать card v2.

## Уточнение schema-проверки

Первый расширенный диагностический запрос использовал несколько неканонических имён полей и не является rollout gate.

Авторитетный schema preflight строится из `COMMON_REQUIRED_COLUMNS` в:

`tools/generate_crm_installation_production_rpc_candidate.py`

По этому списку:

- required columns: 73;
- missing columns: 0;
- coverage: 100%.

## Advisors

Новых installation-specific `WARN` или `ERROR` не обнаружено.

Известные security findings вне границы rollout:

- `nav_*` SECURITY DEFINER execute warnings;
- Auth leaked-password protection disabled.

Известные performance findings вне границы rollout:

- legacy FK без индексов;
- legacy RLS initplan warnings;
- legacy multiple permissive policies;
- unused indexes на пустых или малонагруженных таблицах.

`nav_*` не менять.

## Logs

Installation Edge ещё не существует, поэтому installation Edge logs отсутствуют.

В Postgres logs присутствуют ожидаемые `permission denied` от автоматических `nav_*` access probes. Они подтверждают deny и не относятся к installation rollout.

Не обнаружено:

- installation-specific 5xx;
- installation-related Auth errors;
- installation-related Postgres errors.

## Решение P0

`P0 = passed`

Stop condition не сработал.

Следующий gate:

`P1_apply_rbac_receipts`

Он требует отдельного явного production approval.

Generic-команда «продолжай» не считается разрешением на применение production migration.

## Воспроизведение

Read-only SQL:

`supabase/production-preflight/20260723_installation_p0_readonly.sql`

Он содержит только `WITH`, `SELECT` и обращения к системным каталогам/рабочим таблицам без DDL/DML.

## Запрещено до P1 approval

- применять RBAC/receipts migration;
- применять read/update RPC migrations;
- deploy Edge;
- создавать Auth users или fixtures;
- переключать loader card v2 → card v3;
- изменять `nav_*`.

Production не изменён.
