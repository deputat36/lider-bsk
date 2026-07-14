# Общий CSS навигации по полиграфии

Дата: 14 июля 2026 года.

## Цель

Убрать inline CSS с двух связанных коммерческих страниц:

- `poligrafiya-borisoglebsk.html` — основной хаб полиграфии;
- `poligrafiya-katalog.html` — каталог направлений.

## Реализация

Обе страницы используют `assets/public-print-navigation.css?v=1`.

Различия сохраняются через page-классы:

- `page-print-hub` — расширенный хаб с формой, карточками, тегами и CTA;
- `page-print-catalog` — компактный каталог из десяти ссылок.

Переменная `--page-max` сохраняет исходную ширину:

- 1120 px для хаба;
- 980 px для каталога.

## Сохранённые контракты

Для хаба сохранены:

- Service JSON-LD;
- данные `data-lead-service` и `data-lead-message`;
- форма v5;
- related services v2;
- общий print preset v1;
- шесть карточек и CTA на конструктор визиток.

Для каталога сохранены десять ссылок на товары полиграфии и обратная ссылка в хаб.

## Постоянная проверка

`tools/check_public_print_navigation_css.py` и workflow `Public print navigation CSS check` защищают:

- отсутствие inline CSS и style-атрибутов;
- два page-класса и разные visual modifiers;
- порядок CSS на странице с формой;
- canonical, H1 и CTA;
- шесть карточек хаба;
- десять товарных ссылок каталога;
- отсутствие executable inline JavaScript.

## Границы

CRM UI, `nav_*`, Supabase schema, RLS, Auth, Edge Functions и production-данные не изменялись.
