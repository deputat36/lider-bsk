# Подключение редактора прайса — 25.10.2026

После установки серверного пакета #587/#594 владелец поручил проверить вход
и подключить интерфейс: «Делай». Подключаются существующий редактор и создание
позиции из калькулятора. SQL/ACL/профили/Auth-настройки не меняются.

Production разрешён только для exact HTTPS origin `ofewxuqfjhamgerwzull.supabase.co`
и положительного `catalog.access` текущего actor. Edge принимает только
action/request_id, проверяет настоящий JWT через Auth и canonical catalog.manage.
Доступность business RPC проверяется пустым p_payload: известный invalid_payload
возвращается до изменения business rows/receipts. Остановленный/неожиданный RPC
даёт 503. Входной actor_id не принимается, цены/профили в ответ не включаются.

Клиент сверяет nonce, actor_id, project_ref и contract. Proof хранится только
в памяти клиента/вкладки, сбрасывается при смене user/роли/активности/готовности
профиля. Запросы объединяются, 8-секундный timeout сохраняет read-only, поздний
ответ после сброса не применяется. Каталог выводится до окончания проверки.
Серверная авторизация, CAS и idempotency каждой записи остаются независимыми.

Редактор и калькулятор используют общий proof и singleton transport. Все старые
cache aliases ведут к `20261025-catalog-access-1`. Новый прайс не переоценивает
сохранённые расчёты/КП. Readiness не создаёт logs/receipts/Auth users/профили.
После stop RPC новая проверка доступа не проходит; browser writes не открываются.

Проверки: `test_catalog_access.mjs` исполняет actual staging/generated production
handlers с synthetic Auth/service fetch; проверяет неверные origin/actor/project/
nonce/contract, canonical deny, stopped RPC, timeout и поздний ответ. Business
write-path проверяется отдельно. Внешних HTTP нет.

`test_crm_recovery_browser.mjs` прошёл 360/390/1440: неподтверждённый production
read-only, повтор проверки открывает настоящий editor, калькулятор получает
общий доступ, сохраняются ввод/конфликты/точные повторы/actor/route guards.
Synthetic mobile/desktop screenshots просмотрены. Прежние actual need→calculation
1440/390, pricing, source/inventory/loading/cache checks также прошли.

Рабочая база до подключения: 69 позиций, MD5 всего каталога
`67ac8366d079173715e97f7c06965d47`; при публикации сверяется повторно.
Точные deployed Edge version/hash, CI и публикация фиксируются в PR.

Cloud browser показал форму Email/Пароль без активной сессии. Положительный
Auth→Edge→UI proof под настоящим владельцем фиксируется после защищённого входа;
synthetic browser/handler tests не объявляются таким proof. Секреты не
запрашиваются в чате и не попадают в репозиторий.
