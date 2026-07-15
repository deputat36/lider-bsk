# Внешний CSS страницы примеров рекламных задач

Дата: 15 июля 2026 года.

## Цель

Убрать крупный inline CSS из `primery-rabot-kejsy.html`, сохранив визуальное оформление, SEO, форму заявки и честное позиционирование страницы как набора типовых сценариев, а не вымышленного портфолио.

## Изменения

Создан кешируемый stylesheet:

- `assets/public-examples.css?v=1`.

Страница подключает файлы в следующем порядке:

1. `assets/public-lead-form.css?v=22`;
2. `assets/public-examples.css?v=1`.

Для явного контракта страницы добавлен body-класс:

- `page-examples`.

## Что сохранено

Без изменений оставлены:

- title и description;
- canonical;
- Open Graph и Twitter Card;
- CollectionPage JSON-LD;
- шесть карточек типовых рекламных задач;
- четыре шага получения расчёта;
- связанные услуги;
- телефон;
- форма `public-lead-form.js?v=22`;
- централизованный preset `primery-rabot-kejsy.html`;
- тексты, которые прямо сообщают, что карточки не являются реальными кейсами или отзывами.

Не добавлялись:

- вымышленные фотографии;
- названия клиентов;
- результаты рекламных кампаний;
- отзывы;
- гарантии;
- неподтверждённые сроки или показатели.

## Автоматическая защита

Расширен `tools/check_public_examples_consolidation.py`.

Проверка контролирует:

- точный порядок stylesheet;
- наличие `public-examples.css?v=1`;
- отсутствие inline CSS;
- отсутствие исполняемого inline JavaScript;
- сохранение JSON-LD;
- правильный body-класс;
- шесть карточек и четыре шага;
- форму заявки;
- централизованный preset;
- честные оговорки о типовых сценариях;
- отсутствие старых заглушек портфолио;
- canonical, sitemap и SEO-реестры;
- legacy-редирект `portfolio.html`;
- локальные HTML-ссылки.

Workflow `Public examples consolidation check` теперь также отслеживает общий CSS и shared form preset.

## Supabase read-only snapshot

На момент подготовки изменения:

- production project: `ACTIVE_HEALTHY`;
- `leader-public-lead`: ACTIVE, версия 10;
- всего записей в `leader_leads`: 12;
- записей с `request_id`: 1;
- заявок со страницы `primery-rabot-kejsy.html`: 0;
- последняя заявка: 1 июля 2026 года, 14:20:01 UTC.

Production Supabase не изменялся.

## Границы

Не изменялись:

- Supabase schema, RLS, grants, Auth, Edge Functions и данные;
- CRM UI;
- `nav_*` и `nav_v2_*`;
- содержимое legacy-редиректа;
- реальные материалы портфолио, которые остаются заблокированы до получения подтверждённых фотографий и фактов.
