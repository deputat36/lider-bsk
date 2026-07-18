# Приоритетные коммерческие страницы: форма v27

Дата: 2026-07-18.

## Зачем сделано

На семи страницах с наиболее явным намерением заказать услугу оставалась старая
версия URL общего скрипта формы. Сам файл уже содержит стабильный `request_id`,
повтор безопасной отправки, путь страницы и UTM-атрибуцию, но прежний cache marker
мог удерживать старый ответ у повторного посетителя или на промежуточном кеше.

## Что изменено

На `assets/public-lead-form.js?v=27` переведены:

- `bannery-borisoglebsk.html`;
- `pechat-bannerov-borisoglebsk.html`;
- `vyveski-borisoglebsk.html`;
- `tablichki-borisoglebsk.html`;
- `nakleyki-plotternaya-rezka-borisoglebsk.html`;
- `pechat-na-plenke-borisoglebsk.html`;
- `reklama-dlya-magazina-borisoglebsk.html`.

Пять из этих страниц являются готовыми целями внутреннего конструктора UTM-ссылок.
Три принимают исторический трафик со старых адресов `/banner/`, `/auto-stickers/`
и `/signs/`. Реализация формы, её поля, endpoint и данные Supabase не менялись.

## Контроль результата

`tools/check_public_priority_form_cache_v27.py` фиксирует:

- ровно одно подключение формы v27 и один mount на каждой странице;
- наличие service preset для каждой страницы;
- наличие `request_id`, `page_path`, `submitted_at`, UTM и consent markers в общем скрипте;
- сохранение пяти приоритетных целей в модели UTM-ссылок.

Отдельный CI workflow запускает новый контракт вместе с существующими проверками
страниц и общего cache baseline. Проверка не отправляет production-заявку.

## Read-only baseline

На checkpoint 2026-07-18 в production Supabase: 13 заявок, 9 заявок с расчётом,
8 с предложением и 5 со связанным заказом. После checkpoint 2026-07-17 20:33:23 UTC
новых заявок не было. Эти числа использованы только как baseline; записи Supabase
не создавались и не изменялись.
