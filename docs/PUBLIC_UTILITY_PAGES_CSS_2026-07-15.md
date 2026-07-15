# Общий CSS служебных публичных страниц — 15 июля 2026

## Цель

Убрать встроенные стили со служебных страниц публичного сайта РА «Лидер» и сохранить их внешний вид, содержание и назначение без вмешательства в CRM или Supabase.

## Страницы

- `404.html`;
- `privacy.html`.

Обе страницы подключают:

```html
<link rel="stylesheet" href="assets/public-utility-pages.css?v=1">
```

## Варианты оформления

### Страница 404

Body-класс:

```html
<body class="page-not-found">
```

Сохранены:

- тёмный фирменный фон;
- крупный код 404;
- кнопки возврата и обращения;
- навигация на услуги, примеры задач, цены и контакты;
- телефон и ссылка на политику;
- мобильная адаптация;
- `noindex, nofollow`;
- отсутствие canonical и формы заявки.

### Политика обработки данных

Body-класс:

```html
<body class="page-privacy">
```

Сохранены без редакционного изменения:

- title, description и canonical;
- Open Graph и Twitter Card;
- все разделы политики;
- телефон `8 980 245-74-71`;
- email `zakaz@lider-bsk.ru`;
- ссылка возврата на главную;
- светлая карточная верстка.

Этот пакет не является юридической переработкой политики. Он меняет только способ подключения стилей.

## Автоматические контракты

### `tools/check_public_404_page.py`

Проверяет:

- `noindex, nofollow`;
- отсутствие canonical;
- один H1 и один main;
- aria-label навигации;
- обязательные recovery-ссылки;
- отсутствие формы, Supabase/CRM-маркеров и исполняемого inline JavaScript;
- единственный stylesheet `public-utility-pages.css?v=1`;
- body-класс `page-not-found`;
- отсутствие inline CSS;
- CSS-маркеры тёмной страницы и адаптивности.

### `tools/check_public_privacy_page.py`

Проверяет:

- title, description, robots и canonical;
- Open Graph и Twitter Card;
- один H1, main и article;
- body-класс `page-privacy`;
- единственный stylesheet `public-utility-pages.css?v=1`;
- отсутствие inline CSS и исполняемого inline JavaScript;
- ключевые разделы политики, телефон и email;
- CSS-маркеры светлой карточной страницы;
- отсутствие внутренних Supabase-маркеров.

## GitHub Actions

Обновлены:

- `.github/workflows/public-404-page-check.yml`;
- `.github/workflows/public-privacy-seo-check.yml`.

Оба workflow запускаются при изменении общего CSS, соответствующей страницы, валидатора или этой документации.

## Границы

Не изменялись:

- тексты политики и 404;
- публичная форма заявки;
- CRM UI;
- файлы `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth, Edge Functions и production-данные.
