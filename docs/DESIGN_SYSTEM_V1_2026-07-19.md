# Дизайн-система РА «Лидер» v1

Дата: 2026-07-19  
Статус: первая рабочая итерация сайта и CRM  
Figma: https://www.figma.com/design/QCLweEDrvGps3ys2YMiPDm

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
- цвет статуса не должен конкурировать с главным действием.

## Цвета

### Базовые

- Black: `#141414`
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
- H1: 900, 42–78 px на сайте, 34–58 px в CRM;
- H2: 900, 31–52 px на сайте, 25–30 px в CRM;
- H3: 900, 18–22 px;
- Body: 400–500, 15–18 px;
- Label / Button: 900, 12–16 px;
- Service label: uppercase, увеличенный letter-spacing.

## Геометрия

- маленький радиус: 14–18 px;
- карточка: 22–28 px;
- крупный рекламный блок: 30–40 px;
- кнопка: pill / `999px`;
- рабочая сетка сайта: до 1220 px;
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
14. Footer

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

## Правила действий в CRM

- оранжевый используется для одного основного действия;
- вторичные действия остаются белыми или раскрываются через `details`;
- опасные действия не используют фирменный оранжевый;
- завершённое состояние обозначается зелёным;
- предупреждение использует мягкий оранжевый фон, но не градиент кнопки;
- вкладки не должны переноситься в несколько хаотичных строк: на узких экранах используется горизонтальная прокрутка.

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
- Portfolio
- Public request form

### CRM

- Login
- Manager dashboard
- Leads
- Lead card
- Calculation and commercial offer
- Orders
- Production
- Finance
- Mobile CRM

## Реализовано в коде

В ветке `design/ra-lider-site-crm-v1`:

- обновлён `assets/public-homepage.css`;
- обновлён `crm/v4/assets/v4/ui-polish.css`;
- сохранены существующие HTML, JavaScript, формы и Supabase-контракты;
- публичная страница не получила новых внешних зависимостей;
- CRM не получила новых запросов к базе.

## Ограничение Figma

Файл создан, однако Figma Starter остановил дальнейшие MCP-вызовы по лимиту. Дизайн-система зафиксирована в коде и этом документе, поэтому после восстановления лимита экраны можно собрать в Figma без повторного исследования.

## Следующая итерация

1. Проверить CI и визуальные регрессии первой ветки.
2. Собрать Figma Foundations и компоненты.
3. Переработать структуру CRM-дашборда: очередь внимания, KPI, быстрые действия.
4. Подготовить мобильный экран CRM.
5. Распространить публичную систему на страницы услуг и портфолио.
