# Staging frontend рабочего маршрута заявки

Дата: 23 июля 2026 года.

## Проблема

Карточка заявки уже подсказывала обязательного ответственного и будущий следующий контакт, а staging backend после PR #460 умел проверять эти правила атомарно. Но кнопки карточки продолжали выполнять прямой browser update и отдельно писать событие истории. Поэтому реальный интерфейс не использовал проверенный server-side контракт.

## Решение

Добавлен точный staging-only маршрут для трёх рабочих изменений:

- взять заявку на себя;
- изменить рабочий статус;
- назначить или изменить следующий контакт.

При `V4_CONFIG.supabaseUrl = https://otulfnouybahfnsycxqn.supabase.co` browser capture-перехватчик останавливает прежний прямой update и вызывает `leader-crm-leads-staging` с:

- user JWT текущей сессии;
- `request_id`;
- `expected_updated_at`;
- отдельным idempotency key;
- allowlist-полями `status`, `next_contact_at`, `assigned_to`.

Сервер выполняет lead update, событие истории и receipt в одной транзакции. После успеха карточка перечитывает актуальное состояние. При conflict карточка также обновляется, чтобы сотрудник не перезаписал более свежие изменения.

## Защита от двойной истории

На staging старый обработчик карточки не запускается, поэтому browser больше не добавляет второе событие после server-side workflow event.

## Production boundary

Production URL `ofewxuqfjhamgerwzull.supabase.co` не переключён. Для него sidecar ничего не перехватывает, и существующий рабочий direct-write путь остаётся без изменений до отдельного production rollout и подтверждения.

Не изменялись:

- production Supabase;
- Edge Functions production;
- RLS, grants и Auth;
- данные клиентов и заявок;
- `nav_*`, `nav_v2_*`, `parket_*` и другие проекты.

## Проверка

Автоматически проверяются:

- точное распознавание staging hostname;
- production fallback без изменения поведения;
- allowlist workflow-полей;
- команда Edge и optimistic concurrency;
- JWT session requirement;
- классификация server-side ошибок;
- capture interception;
- отсутствие browser-generated второго события;
- соответствие Edge v4 и frontend-контракта.

Следующий gate — одноразовый authenticated UI smoke на synthetic staging-заявке с полной очисткой пользователя, профиля, заявки, события и receipt.
