# CRM v4 transfer notes

Дата: 2026-06-21.

Рабочая ссылка для проверки:

`https://deputat36.github.io/lidercalculator/app-v4.html`

Основная цель: перенести рабочую CRM v4 из `deputat36/lidercalculator` в `deputat36/lider-bsk/crm/v4/`.

## Текущее состояние

Перенос выполняется пакетами, потому что одной HTML-страницы недостаточно. Нужно переносить связанные CSS и JS-модули вместе с зависимостями.

Важное исправление от 2026-06-21: в `crm/v4/index.html` были ссылки на модули и стили, которых ещё не было в основном репозитории. Из-за этого CRM v4 могла падать при загрузке или выглядеть сломанной. Базовые недостающие файлы добавлены.

В основной репозиторий уже перенесены или добавлены:

- `crm/v4/assets/v4/styles.css`;
- `crm/v4/assets/v4/needs.css`;
- `crm/v4/assets/v4/calculations.css`;
- `crm/v4/assets/v4/config.js`;
- `crm/v4/assets/v4/api.js`;
- `crm/v4/assets/v4/state.js`;
- `crm/v4/assets/v4/ui.js`;
- `crm/v4/assets/v4/supabase-client.js`;
- `crm/v4/assets/v4/router.js`;
- `crm/v4/assets/v4/auth.js`;
- `crm/v4/assets/v4/auth-session-reset-v1.js`;
- `crm/v4/assets/v4/functions-client.js`;
- `crm/v4/assets/v4/crm-v4-tabs-lite.js`;
- `crm/v4/assets/v4/crm-diagnostics-v1.js`;
- `crm/v4/assets/v4/site-cache-note-v1.js`;
- `crm/v4/assets/v4/crm-ui-selfcheck-v1.js`;
- `crm/v4/assets/v4/public-lead-audit-v1.js`;
- `crm/v4/assets/v4/leads.js`;
- `crm/v4/assets/v4/lead-card.js`;
- `crm/v4/assets/v4/lead-create.js`;
- `crm/v4/assets/v4/lead-create.css`;
- `crm/v4/assets/v4/contact-control-v1.js`;
- `crm/v4/assets/v4/needs.js`;
- `crm/v4/assets/v4/calculations.js`.

Исправлено в карточке заявки:

- возврат из карточки к списку теперь вызывает `showLeadList(true)` только по явной кнопке;
- обработчик route-change без выбранной заявки вызывает `showLeadList(false)`;
- это убирает риск петли `showLeadList()` → `clearLeadUrl()` → `leader-v4:route-change` → `showLeadList()`.

Перенесено по базовым расчётам:

- `calculations.js` заменён с заглушки на рабочий базовый модуль из временной CRM;
- модуль загружает расчёты из `leader_lead_calculations`;
- создаёт черновик расчёта и позиции в `leader_lead_calculation_items`;
- поддерживает базовые режимы: баннер, плёнка, листовой материал, фото A4, услуга, ручная позиция;
- после сохранения расчёта переводит заявку в статус `Расчёт подготовлен`, если заявка ещё не находится в финальном статусе;
- в `crm/v4/index.html` обновлён cache-buster `calculations.js?v=20260621-2`.

Что ещё не перенесено по расчётам:

- `calculations-saved-tools-v2.js`;
- `calculations-standard.js`;
- `calculations-advanced.js`;
- `calculations-saved-tools.css`;
- интеграция сохранённых расчётов с КП и заказами.

`crm/v4/index.html` обновлён так, чтобы показывать только реально подключённые рабочие разделы переноса:

- `Заявки`;
- `Карточка заявки`, открывается программно из списка и контроля контактов;
- `Контроль контактов`, который добавляется модулем `contact-control-v1.js`;
- `Аудит заявок`, который добавляется модулем `public-lead-audit-v1.js`.

Кнопки ещё не перенесённых разделов временно не выводятся, чтобы пользователь не видел нерабочие вкладки.

## Проверка, выполненная из Codex

Проверено через GitHub connector:

- `crm/v4/index.html` содержит подключения базовых CSS и JS;
- `styles.css`, `needs.css`, `calculations.css`, `lead-create.css` существуют;
- `supabase-client.js`, `leads.js`, `lead-card.js`, `needs.js`, `calculations.js` существуют;
- `lead-card.js` содержит исправленный `showLeadList(updateUrl = false)`;
- `calculations.js` содержит рабочие функции `renderCalculations`, `loadCalculations`, `saveCalculation` и обработчики событий карточки заявки;
- `crm/v4/index.html` подключает `calculations.js?v=20260621-2`.

Проверено через Supabase connector:

- `leader-public-lead` активна, версия 6, `verify_jwt=false`;
- `leader-crm-leads` активна, версия 7, `verify_jwt=true`;
- `leader-crm-orders` активна, версия 2, `verify_jwt=true`.

Ограничение проверки:

- HTTP-запрос из текущего окружения к `https://deputat36.github.io/lider-bsk/crm/v4/` возвращает `403`;
- raw GitHub download из текущего окружения тоже возвращает `403`, поэтому локальный `node --check` через curl не выполнен;
- это не доказывает поломку CRM, но не позволяет засчитать браузерную проверку из Codex;
- нужна ручная проверка в обычном браузере владельца после Ctrl + F5.

## Рекомендуемый порядок проверки

1. Открыть `crm/v4/` в основном репозитории через GitHub Pages.
2. Проверить вход и выход.
3. Если вход зависает, нажать `Выйти / сбросить вход` и Ctrl + F5.
4. Проверить загрузку списка заявок.
5. Открыть карточку заявки.
6. Нажать `Назад к списку` и убедиться, что список открывается без зависания и повторного переключения.
7. Проверить смену статуса и сохранение следующего контакта.
8. Добавить тестовую потребность в карточке.
9. Создать простой расчёт: выбрать `Баннер`, указать размеры, добавить позицию, сохранить расчёт.
10. Убедиться, что расчёт появился в карточке, а заявка получила статус `Расчёт подготовлен`, если статус не был финальным.
11. Проверить ручное создание заявки.
12. Открыть `Контроль контактов`.
13. Открыть `Аудит заявок`.
14. Нажать `Проверить CRM` в диагностическом блоке.
15. Открыть консоль браузера и убедиться, что нет 404 по CSS/JS из `assets/v4/`.

## Рекомендуемый порядок следующего переноса

1. Перенести расширенный расчётный контур:
   - `calculations-saved-tools-v2.js`;
   - `calculations-standard.js`;
   - `calculations-advanced.js`;
   - `calculations-saved-tools.css`;
   - связанные события сохранённых расчётов.

2. Затем перенести КП и заказы:
   - `offer-card-v1.js`;
   - `offer-print.js`;
   - `offer-print-brand-v4.js`;
   - `offer-order-create-v1.js`;
   - заказы и карточку заказа.

3. Затем перенести управленческие разделы:
   - рабочий стол;
   - дашборд;
   - финансы;
   - производство;
   - монтаж;
   - расширенное меню;
   - дополнительные self-check и диагностику.

4. После переноса очередного пакета обновлять `crm/v4/index.html` только теми разделами, которые действительно работают.

5. Только после проверки переключать основной адрес CRM v4.

## Ограничения

- Рабочую версию в `lidercalculator` не удалять до завершения проверки.
- Старую CRM v2 не удалять до отдельного подтверждения.
- Таблицы `nav_*` не использовать.
- Крупные JS-файлы лучше переносить локальным commit-пакетом или небольшими логическими пакетами, а не случайной частичной вставкой.
