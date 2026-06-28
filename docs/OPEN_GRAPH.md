# Open Graph для публичного сайта РА «Лидер»

Дата: 2026-06-28.

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

## Что уже добавлено вручную

1. Добавлен общий фирменный PNG OG-образ:

   `assets/og-lider-default.png`

2. SVG-версия сохранена как редактируемый исходник:

   `assets/og-lider-default.svg`

3. На главную страницу `index.html` добавлены и защищены CI:

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

4. На страницу заявки `request.html` добавлены и защищены CI:

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

5. На страницу политики `privacy.html` добавлены и защищены CI:

   - `description`;
   - `canonical`;
   - базовый Open Graph / Twitter Card набор;
   - `og:image` и `twitter:image` на PNG.

6. В `sitemap.xml` добавлен `lastmod` для всех публичных URL.

7. Проверка `.github/workflows/open-graph-check.yml` защищает:

   - наличие `assets/og-lider-default.svg`;
   - наличие `assets/og-lider-default.png`;
   - PNG-сигнатуру файла;
   - наличие OG/Twitter-тегов на `index.html`;
   - наличие OG/Twitter-тегов на `request.html`;
   - наличие `description` и `canonical` на `privacy.html`;
   - наличие `lastmod` в sitemap.

## Автоматизация для основных коммерческих страниц

Чтобы не править вручную длинные HTML-файлы с большими inline-стилями, добавлены:

- `tools/open_graph_pages.json` — единый конфиг страниц, URL, `og:title` и `og:description`;
- `tools/apply_open_graph.py` — dependency-free инструмент для проверки и вставки OG/Twitter-метатегов.

Проверка:

```bash
python3 tools/apply_open_graph.py --check
```

Применение:

```bash
python3 tools/apply_open_graph.py --apply
```

После применения нужно посмотреть diff и закоммитить изменённые HTML-файлы.

## Страницы в конфиге

- `index.html` — главная;
- `prices.html` — цены;
- `portfolio.html` — портфолио;
- `bannery-borisoglebsk.html` — баннеры;
- `vyveski-borisoglebsk.html` — вывески;
- `nakleyki-plotternaya-rezka-borisoglebsk.html` — наклейки и плоттерная резка;
- `outdoor-advertising-borisoglebsk.html` — наружная реклама;
- `reklama-dlya-biznesa.html` — реклама для бизнеса;
- `reklama-dlya-magazina-borisoglebsk.html` — реклама для магазина;
- `reklama-dlya-kafe-borisoglebsk.html` — реклама для кафе;
- `reklama-v-soobshchestvah-borisoglebska.html` — реклама в сообществах;
- `yandex-karty-2gis.html` — Яндекс Карты и 2ГИС.

## Следующий шаг

Запустить `python3 tools/apply_open_graph.py --apply` в рабочей копии репозитория или через Codex/локальное окружение, проверить diff и открыть отдельный PR с уже изменёнными HTML-страницами.

Сначала стоит пройти по коммерческим страницам из `tools/open_graph_pages.json`, потому что главная, заявка и политика уже закрыты отдельными CI-проверками.
