# Актуальная форма на связанных коммерческих страницах

Дата: 2026-07-18.

## Зачем

Шесть связанных коммерческих страниц продолжали запрашивать общий скрипт формы
по старому cache marker `v=5`. Из-за этого повторный посетитель мог получить из
кэша прежнюю реализацию вместо действующих контрактов `request_id`, безопасного
повтора отправки и UTM-атрибуции.

## Что изменено

- `banner-dlya-magazina-borisoglebsk.html`;
- `oformlenie-vhoda-borisoglebsk.html`;
- `nakleyki-na-vitrinu-borisoglebsk.html`;
- `rezhim-raboty-tablichki-borisoglebsk.html`;
- `outdoor-advertising-borisoglebsk.html`;
- `reklama-otkrytiya-magazina-borisoglebsk.html`.

На всех страницах единственное подключение формы переведено на
`assets/public-lead-form.js?v=28`. Сам общий скрипт, тексты страниц, цены,
service presets и endpoint отправки не менялись.

## Проверка и измерение

- source-checker требует ровно одно подключение формы и ровно один mount;
- защищены service presets и ключевые поля действующего payload;
- sitemap содержит достоверный `lastmod` `2026-07-18` для всех шести URL;
- текущая партия из шести URL отправляется через IndexNow только после merge;
- production Supabase используется только для read-only сравнения новых заявок.

После отдельной production cleanup в 2026-07-18 14:42:44 UTC актуальная воронка:
13 заявок, 9 заявок с расчётом, 8 с предложением и 0 записей заказа. Пять старых
статусов `Создан заказ` не имеют order-link и вынесены в issue #381. После
публикации релиза новых заявок пока нет.
