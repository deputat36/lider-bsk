# Плановые цены в командах производства и монтажа

04.10.2026. Продолжение #202/#204/#226, отдельный staging-only блок после PR569.

## Изменение

Создание производственного задания принимает contractor_cost, монтажного —
installer_cost/client_price. Одного production.write/installation.write было
достаточно для выбора этих сумм даже для contractor/installer без orders.update.
Теперь присутствие любого из этих ключей (включая явный null/0) требует свежего
canonical orders.update до receipt/hash/replay. Менеджер сохраняет свой процесс;
исполнитель может не передавать финансовые поля. Это плановые значения заказа,
не finance.write и не платежи/расходы. Существующие update-команды уже отклоняют
финансовые patch keys; их контракты не изменены.

Миграция: `supabase/staging-migrations/20261004113043_operational_planned_price_permission_v1.sql`.
CLI создал timestamp; файл перемещён в staging-only каталог. Проверяются точные
fingerprints двух исходных RPC, environment_guard и SECURITY INVOKER. Shared core,
Auth/Storage, table grants/RLS и бизнес-строки миграция не меняет. Не использовать
этот staging upgrade как production candidate/db push.

## Proof

До apply: rehearsal migration + расширенный существующий acceptance в BEGIN/ROLLBACK
прошёл на реальном staging `otulfnouybahfnsycxqn`. После apply тот же SQL прошёл
повторно: manager create/update/replay; contractor/installer price denial на новом
request и историческом replay после потери orders.update; отдельно 0/null по каждому
ключу; positive SQL worker creation без финансов на isolated order/production clones;
минимальный response; inactive/смена роли/actor mismatch/старый receipt privacy;
browser RPC EXECUTE denial. Clones/receipts/events откатываются nested subtransaction,
все acceptance fixtures — внешней ROLLBACK. Это SQL proof, не authenticated browser
worker mutation proof. Полный browser E2E здесь не запускался.

Независимый SELECT: profiles/leads/orders/design/production/installation/
production_events/installation_events/receipts — 9/9 residue=0. Auth users и временный
OIDC trust не создавались. Новые production платежи/расходы/заявки не создавались.

Postflight staging prosrc MD5:
- production create impl: `4a78261ee3e2805068d3dd66d33b55d6`;
- installation create: `b959885ffc2ab91e6fc5aa4a217070dd`.

Обе RPC SECURITY INVOKER; anon/authenticated EXECUTE=false, service_role=true.
Реальный stop rehearsal REVOKE EXECUTE обеих create RPC FROM service_role в
BEGIN/ROLLBACK прошёл; независимый SELECT подтвердил восстановленный service execute.
Для остановки оставлять защиту и receipts, отключать create EXECUTE/соответствующий
frontend gate; не возвращать browser DML. Production backup не создавался: production
в этом блоке не менялся. Production rollout требует отдельного scoped snapshot,
backend candidate, postflight, JWT Edge и полного authenticated role proof.

## Параллельное изменение окружения

Начальная staging проверка показала прежние update RPC fingerprints. Во время
подготовки lock-order upgrade другой запуск установил `operational_order_lock_guards_v1`
(version 20261004112625; branch agent/operational-lock-guards-20261004). Strict drift
check остановил наш lock rehearsal до изменения функции. Дублирующий upgrade не
применялся/не публикуется. Этот PR меняет только create planned-price checks и
расширяет существующий replay test builder. При merge сохранить оба независимых
набора тестов/миграций, сверив свежий main; не заменять чужой lock-order блок.

## Доставка и следующий шаг

Main baseline `4c6ef5229ccd81608d508857a8615928d080a122` опубликован:
Pages run 37146382201 completed/success. HTTP www CRM показывает design commands
importmap v20261003-design-commands-1. Open PR при старте не было.

Production read-only preflight подтвердил operational RPC absence и открытые
INSERT/UPDATE grants для authenticated; permissive policies допускают active profile,
без конкретных production/installation actions. Это доказанный остаточный риск,
не закрытый этой staging миграцией. Production grant cutover нельзя подменять
наличием SQL proof. Следующий этап — совместить актуальные staging upgrades в
существующем operational candidate и пройти positive authenticated worker API/UI,
затем backup/rollback/postflight перед production activation. Astra не требуется.

## Проверенная интеграция PR571

PR570 уже слит в main `03279a656a3b442c6b2f4ea62b705eb60861ba31`.
Конфликты STATUS/test builder разрешены с сохранением обоих независимых upgrades
и всех tests. Combined actual staging SQL PASS после интеграции.
PostgreSQL run [37199422060](https://github.com/deputat36/lider-bsk/actions/runs/37199422060)
completed/success на `19a936d5f7481e7b6def9437465e9e029727c4d2`: все command transactions,
planned-price regression и два actual concurrent order → job RPC scenarios PASS.
Финальная delta после этого proof — только данная запись доказательств.

Staging migration history: planned-price upgrade version `20261004113208`; source
filename timestamp `20261004113043` (MCP apply timestamp отличается). Не применять
повторно по filename. Production read-only итог: 2 orders, 0 design/production/
installation, 1 payment, 0 expenses; этим PR production не изменялся.
