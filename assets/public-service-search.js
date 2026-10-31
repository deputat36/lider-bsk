// Client-side discovery over existing catalog links; no requests or form submissions.
(function () {
  'use strict';
  const host = document.getElementById('service-search');
  if (!host) return;
  const input = host.querySelector('input[type="search"]');
  const results = host.querySelector('[data-search-results]');
  const status = host.querySelector('[data-search-status]');
  const clear = host.querySelector('[data-search-clear]');
  const aliases = {
    'vizitki-borisoglebsk.html': 'визитка визитки визиток карточки контакты печать напечатать распечатать тираж',
    'vyveski-borisoglebsk.html': 'вывеска вывески световая буквы фасад наружная реклама',
    'oformlenie-vhoda-borisoglebsk.html': 'оформление вход входная группа новая точка открытие магазин',
    'reklama-v-soobshchestvah-borisoglebska.html': 'размещение разместить реклама группа группы сообщество сообщества паблик вк vk телеграм telegram',
    'reklamnye-posty-vk-borisoglebsk.html': 'написать пост текст вк vk объявление акция',
    'qr-katalogi-onlayn-zapis.html': 'qr куар кьюар qr-меню меню кафе электронное цифровое каталог онлайн запись',
    'menyu-dlya-kafe-borisoglebsk.html': 'печатное меню кафе ресторан бумажное печать',
    'bannery-borisoglebsk.html': 'баннер баннеры растяжка печать полотно люверсы',
    'poligrafiya-borisoglebsk.html': 'печать напечатать распечатать листовка флаер буклет тираж полиграфия',
    'nakleyki-plotternaya-rezka-borisoglebsk.html': 'наклейка наклейки стикер этикетка пленка винил плоттер',
    'tablichki-borisoglebsk.html': 'табличка таблички указатель навигация кабинет режим работы',
    'dizayn-maketov.html': 'дизайн макет логотип оформление нарисовать разработать',
    'sozdanie-saytov.html': 'сайт сайты лендинг landing страница интернет',
  };
  const stop = new Set(['для', 'мне', 'хочу', 'нужно', 'нужен', 'нужна', 'где', 'как', 'можно', 'сделать', 'заказать', 'шт', 'штук']);
  const normalize = value => String(value || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/([а-я])(\d)/g, '$1 $2').replace(/(\d)([а-я])/g, '$1 $2').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const words = value => normalize(value).split(/\s+/).filter(term => term.length > 1 && !/^\d+$/.test(term) && !stop.has(term));
  const stem = value => /^[а-я]+$/.test(value) ? value.slice(0, 5) : value;
  const index = new Map();
  document.querySelectorAll('main .catalog a[href], main .creative-service-cards a[href], main .service-use-case-cards a[href], main .links a[href]').forEach(link => {
    const target = new URL(link.getAttribute('href'), location.href);
    if (target.origin !== location.origin || !target.pathname.endsWith('.html')) return;
    const href = target.pathname.split('/').pop() + target.search + target.hash;
    const label = (link.querySelector('strong') || link).textContent.trim();
    if (!label || index.has(href)) return;
    const page = target.pathname.split('/').pop();
    index.set(href, { href, label, labelWords: words(label).map(stem), allWords: words(label + ' ' + (aliases[page] || '')).map(stem) });
  });
  function save(query) {
    try { history.replaceState({ ...history.state, leaderServiceSearch: query }, '', location.href); } catch (_) { /* Entry restoration is optional. */ }
  }
  function render(value, persist = true) {
    const query = String(value || '').slice(0, 100);
    if (persist) save(query);
    clear.hidden = !query;
    results.replaceChildren();
    results.hidden = !query.trim();
    if (!query.trim()) { status.textContent = ''; return; }
    const terms = words(query).map(stem);
    const matches = terms.length ? [...index.values()].map(item => {
      const matching = terms.every(term => item.allWords.some(word => word.startsWith(term) || term.startsWith(word)));
      const score = terms.reduce((n, term) => n + (item.labelWords.some(word => word.startsWith(term) || term.startsWith(word)) ? 5 : 1), 0);
      return { ...item, matching, score };
    }).filter(item => item.matching).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, 'ru')) : [];
    status.textContent = matches.length ? 'Найдено: ' + matches.length + (matches.length > 8 ? '. Показаны первые 8 — уточните запрос.' : '') : 'Подходящая услуга не найдена. Попробуйте другое название или опишите задачу.';
    for (const item of matches.slice(0, 8)) {
      const link = document.createElement('a');
      link.className = 'service-search__result';
      link.href = item.href;
      link.textContent = item.label;
      results.appendChild(link);
    }
    if (!matches.length) {
      const link = document.createElement('a');
      link.href = '#request'; link.textContent = 'Помогите подобрать услугу';
      results.appendChild(link);
    }
  }
  input.addEventListener('input', () => render(input.value));
  host.querySelector('form').addEventListener('submit', event => { event.preventDefault(); render(input.value); results.querySelector('a')?.focus(); });
  clear.addEventListener('click', () => { input.value = ''; render(''); input.focus(); });
  function restore() {
    const query = String(history.state?.leaderServiceSearch || '').slice(0, 100);
    input.value = query; render(query, false);
  }
  restore();
  addEventListener('pageshow', restore);
  addEventListener('popstate', restore);
  host.hidden = false;
})();
