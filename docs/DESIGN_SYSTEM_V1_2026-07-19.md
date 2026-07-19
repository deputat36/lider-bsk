# Дизайн-система РА «Лидер» v1

Дата: 2026-07-19  
Статус: рабочая ветка сайта и CRM, PR на визуальную проверку  
Figma: https://www.figma.com/design/QCLweEDrvGps3ys2YMiPDm  
GitHub PR: https://github.com/deputat36/lider-bsk/pull/383

## Цель

Объединить публичный сайт и CRM в одну узнаваемую систему, сохранив действующую бизнес-логику, формы, SEO-контракты и Supabase-интеграцию.

Основной принцип интерфейса:

`один экран → одна понятная задача → одно главное действие`.

## Визуальный характер

- уверенный и практичный;
- современный, но без «стартапной» абстрактности;
- крупная типографика и высокая контрастность;
- графитовая основа, фирменный оранжевый акцент;
- диагональные элементы повторяют пластику знака «Лидер»;
- светлые рабочие карточки используются для информации и операций;
- цвет статуса не должен конкурировать с главным действием;
- служебные и динамические экраны не должны выглядеть как отдельные продукты.

## Цвета

### Базовые

- Black: `#141414` / совместимый публичный токен `#1A1A1A`
- Deep black: `#090A0C`
- Graphite: `#22262B`
- Graphite light: `#343A41`
- White: `#FFFFFF`
- Soft background: `#F5F6F7`
- Line: `#E3E5E8`
- Muted text: `#68717C`

### Бренд

- Orange: `#FF6A00`
- Orange bright: `#FF8126`
- Orange dark: `#D95500`
- Orange soft: `#FFF2E8`

### Состояния

- Success background: `#DCFCE7`
- Success text: `#166534`
- Warning background: `#FFF7ED`
- Warning text: `#9A3412`
- Error background: `#FEE2E2`
- Error text: `#991B1B`

## Типографика

Основной шрифт: `Montserrat`.

Резервные шрифты:

`Arial, Helvetica, sans-serif`.

### Роли

- Display / Hero: 900, uppercase, плотный межбуквенный интервал;
- H1: 900, 40–78 px на сайте, 34–58 px в CRM;
- H2: 900, 29–52 px на сайте, 25–30 px в CRM;
- H3: 900, 18–25 px;
- Body: 400–500, 15–18 px;
- Label / Button: 900, 12–16 px;
- Service label: uppercase, увеличенный `letter-spacing`.

## Геометрия

- маленький радиус: 14–18 px;
- карточка: 22–28 px;
- крупный рекламный блок: 30–40 px;
- кнопка: pill / `999px`;
- рабочая сетка сайта: 1160–1220 px;
- рабочая сетка CRM: до 1320 px.

## Тени

- маленькая карточка: `0 10px 28px rgba(20,20,20,.07)`;
- основная карточка: `0 24px 64px rgba(20,20,20,.13)`;
- тёмный hero: `0 30px 86px rgba(0,0,0,.36)`.

## Компоненты первой очереди

### Публичный сайт

1. Header / sticky navigation
2. Brand mark
3. Primary button
4. Ghost button
5. Hero
6. Scenario card
7. Service card
8. Fact card
9. Package card
10. Process step
11. CTA with lead form
12. FAQ item
13. Mobile fixed actions
14. Document card
15. Recovery route
16. Footer

### CRM

1. CRM shell
2. Authentication card
3. Section navigation
4. Section header
5. Primary action panel
6. Lead card
7. Status badge
8. KPI card
9. Detail card
10. Form field
11. Workflow step
12. Empty state
13. Toast
14. Quick-start card
15. Workload / SLA panel
16. Attribution funnel
17. Readiness panel

## Правила действий в CRM

- оранжевый используется для одного основного действия;
- вторичные действия остаются белыми или раскрываются через `details`;
- опасные действия не используют фирменный оранжевый;
- завершённое состояние обозначается зелёным;
- предупреждение использует мягкий оранжевый фон, но не градиент кнопки;
- вкладки не должны переноситься в несколько хаотичных строк: на узких экранах используется горизонтальная прокрутка;
- динамически создаваемые модули получают общий визуальный адаптер, но их JavaScript и запросы не меняются.

## Карта экранов Figma

### Foundations

- Cover
- Brand and principles
- Colors
- Typography
- Spacing and radius
- Shadows and states

### Site

- Homepage desktop
- Homepage mobile
- Services catalog
- Service detail
- Portfolio / examples
- Public request form
- Commercial landing template
- 404 recovery
- Privacy document

### CRM

- Login
- Manager dashboard
- Leads
- Lead card
- Calculation and commercial offer
- Orders
- Production
- Finance
- Dynamic panels
- Mobile CRM

## Реализовано в коде

В ветке `design/ra-lider-site-crm-v1`:

### Публичный сайт

- `assets/public-homepage.css` — главная страница;
- `assets/public-request.css` — отдельная страница заявки и форма как главное действие;
- `assets/public-landing.css` — общий слой коммерческих страниц;
- `assets/public-examples.css` — примеры работ и кейсы;
- `assets/public-utility-pages.css` — 404 и политика конфиденциальности;
- обновлены тесты CSS главной и страницы заявки под осознанный редизайн;
- HTML, тексты форм, SEO-метаданные, сценарии, номера версий JavaScript и endpoint не менялись.

### CRM

- `crm/v4/assets/v4/ui-polish.css` — базовая система CRM;
- `crm/v4/assets/v4/design-v2-dynamic.css` — адаптер поздно создаваемых панелей;
- `crm/v4/assets/v4/site-cache-note-v1.js` подключает визуальный адаптер и сохраняет прежние импорты модулей;
- управленческая нагрузка, SLA, воронка источников и готовность расчёта/КП приведены к фирменной системе;
- запросы, role guards, расчёты, Supabase-клиент и рабочие действия не менялись.

### Supabase

- production и staging использовались только для определения рабочего контура;
- DDL/DML, Auth, RLS, Storage, Edge Functions и данные не менялись;
- подтверждено, что staging содержит только изолированные таблицы `leader_*` с RLS.

## Проверки

- изменения выполняются в draft PR №383;
- основные статические, CRM, SEO, resource-integrity и Supabase-контракты проходят;
- при изменении визуальных слоёв старые тесты не удаляются: они обновляются так, чтобы защищать функциональные контракты и новые ключевые компоненты;
- merge запрещён до завершения CI и визуальной проверки.

## Ограничение Figma

Файл создан, однако Figma Starter остановил дальнейшие MCP-вызовы по лимиту. Дизайн-система, компоненты и карта экранов зафиксированы в коде и этом документе, поэтому после восстановления лимита экраны можно собрать в Figma без повторного исследования.

## Следующая итерация

1. Завершить все проверки draft PR.
2. Собрать в Figma Foundations и компоненты после восстановления лимита.
3. Нарисовать в Figma главную, страницу заявки и CRM-дашборд по уже внедрённому коду.
4. Проверить мобильные экраны и клавиатурный фокус.
5. Распространить систему на оставшиеся каталоги услуг, цены, контакты и портфолио.
