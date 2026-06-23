# CRM v4 test access

Дата: 2026-06-23.

## Назначение

Документ описывает, как выдать сотруднику или тестировщику доступ к временной рабочей CRM v4 для обучения и проверки системы.

Рабочая ссылка CRM v4:

`https://deputat36.github.io/lidercalculator/app-v4.html`

Чек-лист проверки:

`docs/CRM_V4_TESTER_CHECKLIST.md`

Персональная инструкция для администратора-тестировщика:

`docs/CRM_ADMIN_TESTER_ONBOARDING.md`

## Кого можно допускать

Для тестирования CRM v4 использовать только пользователей, которым реально можно показывать заявки, заказы и аудит.

Разрешённые роли CRM:

- `owner`;
- `admin`;
- `manager`.

Для претендента на администратора использовать роль `admin` только если владелец проекта осознанно разрешил ему видеть и проверять управленческие разделы. Для более ограниченного теста использовать `manager`.

## Выдача доступа

1. Открыть Supabase project `ofewxuqfjhamgerwzull`.
2. Открыть `Authentication` → `Users`.
3. Создать пользователя с email тестировщика или отправить invitation/magic link штатными средствами Supabase Auth.
4. Убедиться, что пользователь может войти по email и паролю или по выданной ссылке.
5. В таблице `leader_user_profiles` создать или обновить профиль пользователя:
   - `user_id` — id пользователя из `auth.users`;
   - `email` — email тестировщика;
   - `role` — `admin` или `manager`;
   - `is_active` — `true`;
   - `full_name` — имя тестировщика, если известно.
6. Не использовать `user_metadata` как источник прав CRM. Права CRM должны проверяться через `leader_user_profiles`.
7. Не менять таблицы `nav_*`: они относятся к другому проектному контуру.

## SQL-шаблон проверки профиля

Этот шаблон предназначен для Supabase SQL Editor. Перед запуском заменить email и роль на нужные.

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

Создать профиль, если его нет:

```sql
insert into public.leader_user_profiles (user_id, email, role, is_active, full_name)
select id, lower(email), 'manager', true, 'Тестировщик CRM'
from auth.users
where lower(email) = lower('test@example.com')
  and not exists (
    select 1
    from public.leader_user_profiles p
    where p.user_id = auth.users.id
  );
```

Обновить роль и активность существующего профиля:

```sql
update public.leader_user_profiles p
set role = 'manager',
    is_active = true,
    updated_at = now()
from auth.users u
where p.user_id = u.id
  and lower(u.email) = lower('test@example.com');
```

Для претендента на администратора заменить `manager` на `admin`, если владелец проекта действительно разрешил административную проверку.

## Что отправить тестировщику

Короткий текст для отправки:

```text
Ссылка для входа в CRM v4:
https://deputat36.github.io/lidercalculator/app-v4.html

Перед первым входом нажмите Ctrl + F5.
После входа нажмите «Проверить CRM» и убедитесь, что email, роль и активность профиля отображаются корректно.
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
   - `Аудит заявок`.

## Снятие доступа

Если тестирование завершено или доступ больше не нужен:

1. В `leader_user_profiles` установить `is_active = false`.
2. При необходимости изменить роль на менее привилегированную.
3. При необходимости отключить или удалить пользователя в Supabase Auth.
4. Попросить пользователя выйти из CRM.
5. Если доступ был чувствительным, проверить свежую сессию повторным входом: неактивный профиль не должен проходить доступ к CRM Edge Functions.

SQL-шаблон снятия доступа:

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
- роль отображается не та, что была назначена;
- профиль активен, но разделы не открываются;
- профиль неактивен, но пользователь продолжает получать данные CRM;
- `Аудит заявок` доступен пользователю без роли `owner`, `admin` или `manager`;
- в браузерной консоли есть ошибки `missing_token`, `bad_token` или `access_denied` при корректном активном профиле.
