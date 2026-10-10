// Canonical service names shared by public forms and CRM. No network or UI side effects.
(function(root){
  'use strict';
  const directions=Object.freeze({"promotion": "Привлечь клиентов", "branding": "Оформить бизнес", "automation": "Автоматизировать бизнес", "production": "Производство рекламы", "other": "Другая задача"});
  const services=[
  {
    "id": "banner",
    "label": "Баннер",
    "direction": "production",
    "category": "Баннеры",
    "pages": [
      "bannery-borisoglebsk.html",
      "pechat-bannerov-borisoglebsk.html",
      "banner-dlya-magazina-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "print",
    "label": "Полиграфия",
    "direction": "production",
    "category": "Полиграфия",
    "pages": [
      "poligrafiya-borisoglebsk.html",
      "birki-etiketki-borisoglebsk.html",
      "blanki-borisoglebsk.html",
      "buklety-borisoglebsk.html",
      "gramoty-borisoglebsk.html",
      "kalendari-borisoglebsk.html",
      "menyu-dlya-kafe-borisoglebsk.html",
      "otkrytki-priglasheniya-borisoglebsk.html",
      "papki-konverty-borisoglebsk.html",
      "razdatochnye-materialy-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "business-cards",
    "label": "Визитки",
    "direction": "production",
    "category": "Визитки",
    "pages": [
      "vizitki-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "stickers",
    "label": "Наклейки",
    "direction": "production",
    "category": "Наклейки",
    "pages": [
      "nakleyki-plotternaya-rezka-borisoglebsk.html",
      "nakleyki-na-vitrinu-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "plates",
    "label": "Табличка",
    "direction": "branding",
    "category": "Таблички",
    "pages": [
      "tablichki-borisoglebsk.html",
      "rezhim-raboty-tablichki-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "film",
    "label": "Печать на плёнке",
    "direction": "production",
    "category": "Печать на плёнке",
    "pages": [
      "pechat-na-plenke-borisoglebsk.html",
      "oformlenie-vitrin-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "plotter",
    "label": "Плоттерная резка",
    "direction": "production",
    "category": "Плоттерная резка",
    "pages": [],
    "questions": []
  },
  {
    "id": "signs",
    "label": "Вывеска / наружная реклама",
    "direction": "branding",
    "category": "Вывески",
    "pages": [
      "vyveski-borisoglebsk.html",
      "outdoor-advertising-borisoglebsk.html",
      "oformlenie-vhoda-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "design",
    "label": "Дизайн макета",
    "direction": "branding",
    "category": "Дизайн",
    "pages": [
      "dizayn-maketov.html",
      "dizayn-3d-animaciya.html"
    ],
    "brief": true,
    "questions": [
      "Что нужно разработать и где будет использоваться макет?",
      "Какие нужны размеры, носители и количество вариантов?",
      "Есть ли тексты, логотип, фото и примеры по стилю?",
      "К какой дате нужны файлы и требуется ли печать?"
    ]
  },
  {
    "id": "visualization-3d",
    "label": "3D-визуализация",
    "direction": "branding",
    "category": "3D-визуализация",
    "pages": ["3d-vizualizaciya-reklamy.html"],
    "brief": true,
    "questions": [
      "Что показать: вывеску, входную группу, конструкцию или интерьер?",
      "Есть ли фото объекта, размеры, логотип или готовая 3D-модель?",
      "Какие нужны ракурсы, дневной или ночной вид, интеграция в фото или видео?",
      "Для чего и к какой дате нужен результат?"
    ]
  },
  {
    "id": "modeling-3d",
    "label": "3D-моделирование",
    "direction": "branding",
    "category": "3D-моделирование",
    "pages": ["3d-modelirovanie-konstrukciy.html"],
    "brief": true,
    "questions": [
      "Что моделируем: вывеску, стелу, баннер, входную группу или интерьер?",
      "Есть ли размеры, чертежи, фото и требования к материалам?",
      "Нужна только модель, изображения или передача исходника в определённом формате?",
      "Для какой задачи и к какой дате нужна модель?"
    ]
  },
  {
    "id": "animation",
    "label": "3D-анимация и моушн-дизайн",
    "direction": "promotion",
    "category": "Анимация",
    "pages": ["animaciya-motion-dizayn.html"],
    "brief": true,
    "questions": [
      "Что должен объяснить или рекламировать ролик и кому он адресован?",
      "Где показываем видео: LED-экран, соцсети, сайт или презентация?",
      "Какие нужны длительность, размер кадра, 2D/3D и исходные материалы?",
      "К какой дате нужен ролик, нужны ли звук, субтитры и версии для разных площадок?"
    ]
  },
  {
    "id": "prepress",
    "label": "Подготовка макетов к печати и ретушь",
    "direction": "production",
    "category": "Подготовка к печати",
    "pages": ["podgotovka-maketov-k-pechati.html"],
    "brief": true,
    "questions": [
      "Что печатаем, на каком материале и каким способом?",
      "Какие нужны итоговые размеры, тираж и требования типографии?",
      "Есть ли исходники и что исправить: ретушь, цвет, текст, контуры или размер?",
      "К какой дате нужен файл и требуется ли изготовление?"
    ]
  },
  {
    "id": "social",
    "label": "Соцсети и контент",
    "direction": "promotion",
    "category": "Соцсети и контент",
    "pages": [
      "reklama-v-socsetyah-borisoglebsk.html",
      "reklama-v-soobshchestvah-borisoglebska.html",
      "reklamnye-posty-vk-borisoglebsk.html",
      "socseti-kontent.html"
    ],
    "questions": []
  },
  {
    "id": "maps",
    "label": "Яндекс Карты и 2ГИС",
    "direction": "promotion",
    "category": "Яндекс Карты и 2ГИС",
    "pages": [
      "yandex-karty-2gis.html",
      "audit-kart-yandex-2gis-borisoglebsk.html"
    ],
    "questions": []
  },
  {
    "id": "identity",
    "label": "Логотип / фирменный стиль",
    "direction": "branding",
    "category": "Логотип / фирменный стиль",
    "pages": [
      "logotip-firmennyy-stil.html"
    ],
    "questions": []
  },
  {
    "id": "campaign",
    "label": "Комплексная реклама",
    "direction": "promotion",
    "category": "Комплексная реклама",
    "pages": [
      "srochnaya-reklama-borisoglebsk.html",
      "reklama-dlya-meropriyatiy-borisoglebsk.html",
      "reklama-dlya-kafe-borisoglebsk.html",
      "reklama-dlya-salona-krasoty-borisoglebsk.html",
      "reklama-dlya-servisa-masterskoy-borisoglebsk.html",
      "reklama-dlya-magazina-borisoglebsk.html",
      "reklama-otkrytiya-magazina-borisoglebsk.html",
      "primery-rabot-kejsy.html",
      "nashi-raboty.html"
    ],
    "questions": []
  },
  {
    "id": "events",
    "label": "Промоакции и открытия",
    "category": "Промоакции и открытия",
    "direction": "promotion",
    "pages": [
      "promoakcii-borisoglebsk.html"
    ],
    "questions": [
      "Какое событие планируется, где и когда?",
      "Кого приглашаем и какое действие ждём от посетителей?",
      "Нужны ли промоутеры, печатные материалы и оформление?",
      "Какой бюджет и кто согласует сценарий?"
    ]
  },
  {
    "id": "websites",
    "label": "Создание сайтов",
    "category": "Создание сайтов",
    "direction": "automation",
    "pages": [
      "sozdanie-saytov.html"
    ],
    "questions": [
      "Что должен сделать посетитель сайта: оставить заявку, записаться или выбрать товар?",
      "Есть ли текущий сайт, домен и готовые материалы?",
      "Какие услуги или товары нужно показать?",
      "Какие сроки, бюджет и способ получения заявок?"
    ]
  },
  {
    "id": "automation",
    "label": "CRM и автоматизация",
    "category": "CRM и автоматизация",
    "direction": "automation",
    "pages": [
      "avtomatizaciya-biznesa.html"
    ],
    "questions": [
      "Какой процесс сейчас отнимает больше всего времени?",
      "Где сейчас ведёте клиентов, заявки и расчёты?",
      "Сколько сотрудников будут работать в системе?",
      "Какой один сценарий нужно запустить первым?"
    ]
  },
  {
    "id": "ai",
    "label": "AI для бизнеса",
    "category": "AI для бизнеса",
    "direction": "automation",
    "pages": [
      "ai-dlya-biznesa.html"
    ],
    "questions": [
      "Какая повторяющаяся задача нужна помощнику?",
      "На каких материалах он должен работать?",
      "Кто проверит ответы и какие данные нельзя передавать?",
      "Нужен помощник, автоматизация или обучение команды?"
    ]
  },
  {
    "id": "apps",
    "label": "Приложения для бизнеса",
    "category": "Приложения для бизнеса",
    "direction": "automation",
    "pages": [
      "prilozheniya-dlya-biznesa.html"
    ],
    "questions": [
      "Кто будет пользоваться приложением и на каких устройствах?",
      "Какую задачу нужно выполнять на телефоне?",
      "Нужна ли работа без интернета и подключение к вашей системе?",
      "Какой минимальный набор функций нужен для первого запуска?"
    ]
  },
  {
    "id": "souvenirs",
    "label": "Сувенирная продукция",
    "category": "Сувенирная продукция",
    "direction": "branding",
    "pages": [
      "suvenirnaya-produkciya.html"
    ],
    "questions": [
      "Кому и по какому поводу предназначены подарки?",
      "Какие изделия и какое количество нужны?",
      "Есть ли логотип и фирменные цвета?",
      "Какие дата, бюджет и способ получения?"
    ]
  },
  {
    "id": "marketplaces",
    "label": "Карточки товаров и Авито",
    "category": "Карточки товаров и Авито",
    "direction": "promotion",
    "pages": [
      "kartochki-tovarov-marketpleysy.html"
    ],
    "questions": [
      "На какой площадке и какие товары или услуги продвигаем?",
      "Сколько карточек или объявлений нужно подготовить?",
      "Есть ли реальные фото и подтверждённые характеристики?",
      "Нужно только оформление или также структура описания?"
    ]
  },
  {
    "id": "qr",
    "label": "QR-каталоги и онлайн-запись",
    "category": "QR-каталоги и онлайн-запись",
    "direction": "automation",
    "pages": [
      "qr-katalogi-onlayn-zapis.html"
    ],
    "questions": [
      "Куда должен вести QR-код: меню, каталог или запись?",
      "Кто будет обновлять ассортимент, цены и расписание?",
      "Есть ли действующая система записи или каталог?",
      "Где разместите код и нужен ли печатный носитель?"
    ]
  },
  {
    "id": "promoters",
    "label": "Промоутеры и распространение рекламы",
    "category": "Промоутеры и распространение рекламы",
    "direction": "promotion",
    "pages": [
      "promoutery-borisoglebsk.html"
    ],
    "questions": [
      "Какие районы и аудиторию нужно охватить?",
      "Что распространяем: листовки, газеты или приглашения?",
      "Есть ли готовый тираж, какие даты и бюджет?",
      "Какой отчёт по распространению нужен?"
    ]
  },
  {
    "id": "other",
    "label": "Другое",
    "direction": "other",
    "category": "Другое",
    "pages": [],
    "questions": []
  }
].map(item=>Object.freeze({...item,pages:Object.freeze(item.pages),questions:Object.freeze(item.questions||[])}));
  const clean=value=>String(value||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
  function find(value){const key=clean(value);return services.find(item=>clean(item.label)===key||item.id===key)||null;}
  function forPage(path){const page=String(path||'').split('?')[0].split('#')[0].split('/').pop();return services.find(item=>item.pages.includes(page))||null;}
  root.LeaderServiceCatalog=Object.freeze({services:Object.freeze(services),directions,find,forPage});
})(globalThis);
