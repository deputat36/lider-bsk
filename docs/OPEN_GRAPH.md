# Open Graph для публичного сайта РА «Лидер»

Дата: 2026-06-26.

## Цель

Ссылки на сайт РА «Лидер» должны корректно выглядеть при отправке во ВКонтакте, Telegram, мессенджерах и при публикации в соцсетях: с понятным заголовком, описанием и фирменной обложкой.

## Что добавлено в этом этапе

1. Добавлен общий фирменный OG-образ:

   `assets/og-lider-default.svg`

   Размер холста: `1200×630`.

2. На страницу заявки `request.html` добавлены:

   - `canonical`;
   - `og:type`;
   - `og:locale`;
   - `og:site_name`;
   - `og:url`;
   - `og:title`;
   - `og:description`;
   - `og:image`;
   - `og:image:type`;
   - `og:image:width`;
   - `og:image:height`;
   - `twitter:card`;
   - `twitter:title`;
   - `twitter:description`;
   - `twitter:image`.

3. На страницу политики `privacy.html` добавлены:

   - `description`;
   - `canonical`;
   - базовый Open Graph / Twitter Card набор.

4. В `sitemap.xml` добавлен `lastmod` для всех публичных URL.

5. Добавлена проверка `.github/workflows/open-graph-check.yml`, которая защищает:

   - наличие `assets/og-lider-default.svg`;
   - наличие OG/Twitter-тегов на `request.html`;
   - наличие `description` и `canonical` на `privacy.html`;
   - наличие `lastmod` в sitemap.

## Ограничение SVG

В этом этапе добавлен SVG-образ, потому что его безопасно хранить в репозитории как текстовый файл и править через GitHub connector. Для максимальной совместимости с ВК и Telegram на следующем визуальном этапе желательно подготовить PNG или JPG 1200×630 и заменить ссылку `og:image` на:

`https://www.lider-bsk.ru/assets/og-lider-default.png`

После замены нужно сохранить SVG как исходник или резервную версию.

## Рекомендуемый следующий шаг

1. Подготовить PNG/JPG 1200×630 на основе `assets/og-lider-default.svg`.
2. Добавить этот PNG/JPG в `assets/`.
3. Массово добавить OG-набор на основные коммерческие страницы:
   - главная;
   - цены;
   - портфолио;
   - баннеры;
   - вывески;
   - наклейки;
   - реклама для бизнеса;
   - реклама для магазина;
   - реклама для кафе;
   - реклама в сообществах;
   - Яндекс Карты и 2ГИС.
4. Для каждой страницы использовать свой `og:title` и `og:description`, а общий `og:image` оставить единым.
