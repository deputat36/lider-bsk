# CRM v4 test access

Дата: 2026-06-27.

## Назначение

Документ описывает, как выдать сотруднику или тестировщику доступ к основной CRM v4 через текущую модель `Доступ`: invite, pending profile и активация owner/admin.

Основная CRM v4:

`https://deputat36.github.io/lider-bsk/crm/v4/`

Прямая проверка вкладки `Доступ`:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

Временная CRM v4:

`https://deputat36.github.io/lidercalculator/app-v4.html`

Чек-лист проверки:

`docs/CRM_V4_TESTER_CHECKLIST.md`

Проверка вкладки `Доступ`:

`docs/CRM_ACCESS_TAB_CHECK_2026-06-27.md`

Персональная инструкция для администратора-тестировщика:

`docs/CRM_ADMIN_TESTER_ONBOARDING.md`

## Кого можно допускать

Для тестирования CRM v4 использовать только пользователей, которым реально можно показывать заявки, заказы и аудит.

Разрешённые рабочие роли CRM:

- `owner`;
- `admin`;
- `manager`.

Для претендента на администратора использовать роль `admin` только если владелец проекта осознанно разрешил ему видеть и проверять управленческие разделы. Для более ограниченного теста использовать `manager`.

## Текущая модель доступа

Нормальный путь выдачи доступа:

1. Активный `owner` или `admin` входит в основную CRM.
2. Открывает `Доступ` через прямой URL или кнопку `Открыть доступ CRM` в карточке `CRM готова`.
3. Создаёт приглашение на email сотрудника.
4. Сотрудник входит в CRM под этим email.
5. Если invite действующий, профиль активируется с ролью из invite.
6. Если invite нет, новый профиль остаётся pending/inactive и CRM workspace блокируется до активации owner/admin.

Не использовать `user_metadata` как источник прав CRM. Права CRM проверяются через `leader_user_profiles` и серверные проверки.

Не менять таблицы `nav_*`: они относятся к другому проектному контуру.

## Выдача доступа через CRM

1. Открыть основную CRM:
   `https://deputat36.github.io/lider-bsk/crm/v4/`
2. Нажать Ctrl + F5.
3. Войти под активным `owner` или `admin`.
4. Открыть вкладку `Доступ` одним из способов:
   - прямой URL: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`;
   - кнопка `Открыть доступ CRM` в карточке `CRM готова`;
   - верхняя вкладка `Доступ` в меню разделов.
5. Проверить build marker `CRM build: 20260627-access-route-1` после свежей загрузки.
6. Создать приглашение:
   - email сотрудника;
   - имя, если известно;
   - роль `manager` или `admin`;
   - срок действия, если нужен;
   - комментарий, если нужен.
7. Попросить сотрудника войти в CRM под тем же email.
8. Проверить, что профиль активен и роль отображается корректно.

## Read-only SQL-шаблоны проверки

Эти запросы предназначены только для проверки состояния. Не использовать их для обхода invite-flow.

Проверить Auth-пользователя:

```sql
select id, email, email_confirmed_at, created_at
from auth.users
where lower(email) = lower('test@example.com');
```

Проверить CRM-профиль:

```sql
select user_id, email, full_name, role, is_active, created_at, updated_at
from public.leader_user_profiles
where lower(email) = lower('test@example.com');
```

Проверить invite:

```sql
select email, role, is_active, expires_at, accepted_at, accepted_user_id, created_at, updated_at
from public.leader_user_invites
where email = lower('test@example.com')
order by created_at desc;
```

Сводка активных ролей без персональных email:

```sql
select role, is_active, count(*)::int as users
from public.leader_user_profiles
group by role, is_active
order by role, is_active desc;
```

## Emergency manual path

Ручное изменение `leader_user_profiles` через SQL допустимо только как emergency-действие владельца проекта, когда CRM UI недоступен. После такого действия нужно отдельно проверить RLS, audit trail и браузерную самодиагностику.

Обычный путь для тестировщиков и сотрудников — только invite через вкладку `Доступ`.

## Что отправить тестировщику

Короткий текст для отправки:

```text
Ссылка для входа в основную CRM v4:
https://deputat36.github.io/lider-bsk/crm/v4/

Если нужно проверить раздел доступа, открой:
https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin

Перед первым входом нажмите Ctrl + F5.
После входа нажмите «Проверить CRM» и убедитесь, что email, роль и активность профиля отображаются корректно.
Если вкладка «Доступ» не видна, используйте кнопку «Открыть доступ CRM» в карточке «CRM готова».
Если что-то не открывается, пришлите скриншот, раздел CRM, время проверки и текст ошибки.
```

Если тестировщик должен пройти полный сценарий, дополнительно отправить чек-лист:

`docs/CRM_V4_TESTER_CHECKLIST.md`

## Проверка после выдачи доступа

1. Тестировщик открывает CRM v4.
2. Нажимает Ctrl + F5.
3. Входит под своим email.
4. Нажимает `Проверить CRM`.
5. В диагностике должно быть:
   - правильный email;
   - роль `admin` или `manager`;
   - активный профиль;
   - основные разделы со статусом `OK`.
6. Проверить открытие разделов:
   - `Заявки`;
   - `Заказы`;
   - `Контроль заказов`;
   - `Финансы`;
   - `Производство`;
   - `Контроль контактов`;
   - `Аудит заявок`;
   - `Доступ` для owner/admin или role-message для non-admin.

## Снятие доступа

Если тестирование завершено или доступ больше не нужен:

1. Активный `owner/admin` открывает вкладку `Доступ`.
2. Отключает профиль сотрудника или закрывает неиспользованный invite.
3. Просит пользователя выйти из CRM.
4. При необходимости отключает пользователя в Supabase Auth.
5. Проверяет повторным входом, что неактивный профиль не получает доступ к CRM workspace и Edge Functions.

Emergency SQL-шаблон снятия доступа:

```sql
update public.leader_user_profiles p
set is_active = false,
    updated_at = now()
from auth.users u
where p.user_id = u.id
  and lower(u.email) = lower('test@example.com');
```

## Что считать проблемой доступа

Проблема, если:

- пользователь вошёл, но диагностика не видит профиль;
- роль отображается не та, что была назначена invite;
- профиль активен, но разделы не открываются;
- профиль неактивен, но пользователь продолжает получать данные CRM;
- invite создан, но пользователь с тем же email остаётся pending;
- новый пользователь без invite активируется автоматически;
- `Доступ` не открывается по прямому URL `?tab=user_admin`;
- кнопка `Открыть доступ CRM` отсутствует после Ctrl + F5;
- `Аудит заявок` доступен пользователю без роли `owner`, `admin` или `manager`;
- в браузерной консоли есть ошибки `missing_token`, `bad_token` или `access_denied` при корректном активном профиле.
