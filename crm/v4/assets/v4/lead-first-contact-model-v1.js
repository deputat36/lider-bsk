const DEFAULT_SERVICE = 'вашей задаче';

const SERVICE_PROFILES = [
  {
    match: /баннер|растяжк|широкоформат/i,
    label: 'баннеру',
    questions: [
      'Какой нужен размер и сколько экземпляров?',
      'Где будет размещён баннер: в помещении или на улице?',
      'Есть ли готовый макет и нужны ли люверсы или другое крепление?',
      'К какой дате нужен готовый заказ?'
    ]
  },
  {
    match: /вывеск|табличк|входн.*групп|оформлен.*вход/i,
    label: 'вывеске или табличке',
    questions: [
      'Какие нужны размеры и что должно быть написано?',
      'Где будет размещена конструкция: внутри или снаружи?',
      'Нужны ли подсветка, макет, замер или монтаж?',
      'К какой дате нужен готовый заказ?'
    ]
  },
  {
    match: /авто|машин|транспорт|оклейк.*(?:авто|машин)|наклейк.*(?:авто|машин)/i,
    label: 'оформлению автомобиля',
    questions: [
      'Какая марка и модель автомобиля?',
      'Что нужно нанести и на какие части кузова?',
      'Есть ли готовый макет, логотип и фирменные цвета?',
      'Когда автомобиль можно предоставить для замера или оклейки?'
    ]
  },
  {
    match: /витрин|магазин|торгов|оформлен.*бизнес/i,
    label: 'оформлению точки',
    questions: [
      'Что именно нужно оформить и по какому адресу?',
      'Есть ли размеры, фотографии объекта и фирменные материалы?',
      'Нужны ли макет, замер, изготовление и монтаж?',
      'К какой дате нужно завершить работу?'
    ]
  },
  {
    match: /визит|листов|буклет|полиграф|печат|афиш/i,
    label: 'печатной продукции',
    questions: [
      'Какой нужен формат и тираж?',
      'Односторонняя или двусторонняя печать?',
      'Есть ли готовый макет или его нужно подготовить?',
      'К какой дате нужен готовый тираж?'
    ]
  },
  {
    match: /дизайн|макет|логотип|фирмен/i,
    label: 'дизайну',
    questions: [
      'Что именно нужно разработать и где это будет использоваться?',
      'Есть ли логотип, тексты, фотографии и фирменные цвета?',
      'Какие примеры по стилю вам нравятся?',
      'К какой дате нужен готовый макет?'
    ]
  }
];

function clean(value, maxLength = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function firstContactGreeting(name) {
  const normalized = clean(name, 80);
  if (!normalized || /(?:^|\s)(?:ооо|ип|ао|зао|пао)(?:\s|$)/i.test(normalized)) return 'Здравствуйте!';
  const firstName = normalized.split(' ')[0];
  return /^[A-Za-zА-Яа-яЁё-]{2,30}$/.test(firstName) ? `Здравствуйте, ${firstName}!` : 'Здравствуйте!';
}

export function firstContactServiceProfile(service) {
  const normalized = clean(service, 160);
  const profile = SERVICE_PROFILES.find((item) => item.match.test(normalized));
  if (profile) return { label: profile.label, questions: [...profile.questions] };
  return {
    label: normalized ? `задаче «${normalized}»` : DEFAULT_SERVICE,
    questions: [
      'Что именно нужно изготовить или оформить?',
      'Какие нужны размеры, количество или тираж?',
      'Есть ли готовый макет и нужны ли замер, доставка или монтаж?',
      'К какой дате нужен готовый заказ?'
    ]
  };
}

export function buildFirstContactQuestions(lead = {}) {
  const profile = firstContactServiceProfile(lead.service);
  return profile.questions.map((question) => `— ${question}`).join('\n');
}

export function buildFirstContactDraft(lead = {}) {
  const profile = firstContactServiceProfile(lead.service);
  return [
    firstContactGreeting(lead.name),
    `Это РА «Лидер». Получили вашу заявку по ${profile.label}.`,
    '',
    'Чтобы подготовить точный расчёт, уточните, пожалуйста:',
    buildFirstContactQuestions(lead),
    '',
    'Можно ответить одним сообщением. Если часть данных пока неизвестна, поможем подобрать подходящий вариант.'
  ].join('\n');
}
