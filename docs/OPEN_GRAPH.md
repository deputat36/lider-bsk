# Open Graph для публичного сайта РА «Лидер»

Дата: 2026-06-26.

## Цель

Ссылки на сайт РА «Лидер» должны корректно выглядеть при отправке во ВКонтакте, Telegram, мессенджерах и при публикации в соцсетях: с понятным заголовком, описанием и фирменной обложкой.

## Текущий общий OG-образ

Основной образ для предпросмотров:

`assets/og-lider-default.png`

Параметры:

- формат: PNG;
- размер холста: `1200×630`;
- назначение: общий фирменный предпросмотр для страниц сайта;
- публичный URL: `https://www.lider-bsk.ru/assets/og-lider-default.png`.

Исходник/резервная версия сохранены в:

`assets/og-lider-default.svg`

## Что добавлено

1. Добавлен общий фирменный PNG OG-образ:

   `assets/og-lider-default.png`

2. SVG-версия сохранена как редактируемый исходник:

   `assets/og-lider-default.svg`

3. На страницу заявки `request.html` добавлены и обновлены:

   - `canonical`;
   - `og:type`;
   - `og:locale`;
   - `og:site_name`;
   - `og:url`;
   - `og:title`;
   - `og:description`;
   - `og:image` на PNG;
   - `og:image:type` = `image/png`;
   - `og:image:width`;
   - `og:image:height`;
   - `twitter:card`;
   - `twitter:title`;
   - `twitter:description`;
   - `twitter:image` на PNG.

4. На страницу политики `privacy.html` добавлены и обновлены:

   - `description`;
   - `canonical`;
   - базовый Open Graph / Twitter Card набор;
   - `og:image` и `twitter:image` на PNG.

5. В `sitemap.xml` добавлен `lastmod` для всех публичных URL.

6. Проверка `.github/workflows/open-graph-check.yml` защищает:

   - наличие `assets/og-lider-default.svg`;
   - наличие `assets/og-lider-default.png`;
   - PNG-сигнатуру файла;
   - наличие OG/Twitter-тегов на `request.html`;
   - наличие `description` и `canonical` на `privacy.html`;
   - наличие `lastmod` в sitemap.

## Рекомендуемый следующий шаг

Массово добавить OG-набор на основные коммерческие страницы:

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

Для каждой страницы использовать свой `og:title` и `og:description`, а общий `og:image` оставить единым.
