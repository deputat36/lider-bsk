// RA Lider public lead form, homepage widgets, prefill, related services, goals and schema.
(function(){
  const ENDPOINT='https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead';
  const METRIKA_ID=109387236;
  const scenarios={
    shop:{service:'Комплексная реклама',text:'Сценарий: открываем / оформляем магазин. Нужны рекомендации по вывеске, баннеру, режиму работы, наклейкам, картам и соцсетям.'},
    cafe:{service:'Комплексная реклама',text:'Сценарий: кафе / доставка / общепит. Нужны рекомендации по меню, витрине, баннерам, соцсетям и карточкам в картах.'},
    service:{service:'Комплексная реклама',text:'Сценарий: сервис / ремонт / мастерская. Нужны рекомендации по фасадной рекламе, указателям, табличкам, прайсу и картам.'},
    beauty:{service:'Комплексная реклама',text:'Сценарий: салон / студия / частный мастер. Нужны рекомендации по логотипу, прайсу, сертификатам, соцсетям и карточке в картах.'},
    construction:{service:'Комплексная реклама',text:'Сценарий: строительство / недвижимость. Нужны рекомендации по баннерам, презентации, коммерческому предложению, листовкам и соцсетям.'},
    office:{service:'Комплексная реклама',text:'Сценарий: пункт выдачи / офис. Нужны рекомендации по табличкам, режиму работы, навигации, наклейкам и картам.'}
  };
  const servicePresets={
    'outdoor-advertising-borisoglebsk.html':{service:'Вывеска / наружная реклама',text:'Страница услуги: наружная реклама. Клиент интересуется баннерами, вывесками, табличками, указателями или оформлением входной группы.'},
    'bannery-borisoglebsk.html':{service:'Баннер',text:'Страница услуги: баннер. Нужно уточнить размер, место размещения, наличие макета, срок, люверсы, доставку или монтаж.'},
    'vyveski-borisoglebsk.html':{service:'Вывеска / наружная реклама',text:'Страница услуги: вывеска. Нужно уточнить место размещения, размер, фото фасада, макет, сроки и нужен ли монтаж.'},
    'pechat-na-plenke-borisoglebsk.html':{service:'Печать на плёнке',text:'Страница услуги: печать на плёнке. Нужно уточнить размер, количество, где будет использоваться плёнка и нужен ли макет.'},
    'oformlenie-vitrin-borisoglebsk.html':{service:'Печать на плёнке',text:'Страница услуги: оформление витрин. Нужно уточнить фото витрины, размеры, что разместить на стекле и нужен ли монтаж.'},
    'nakleyki-plotternaya-rezka-borisoglebsk.html':{service:'Наклейки',text:'Страница услуги: наклейки и плоттерная резка. Нужно уточнить размер, цвет, количество, куда клеить и нужен ли макет.'},
    'tablichki-borisoglebsk.html':{service:'Табличка',text:'Страница услуги: табличка. Нужно уточнить текст, размер, материал, место размещения и способ крепления.'},
    'dizayn-maketov.html':{service:'Дизайн макета',text:'Страница услуги: дизайн макета. Нужно уточнить формат, размер, текст, логотип, примеры и где будет использоваться макет.'},
    'logotip-firmennyy-stil.html':{service:'Логотип / фирменный стиль',text:'Страница услуги: логотип и фирменный стиль. Нужно уточнить направление бизнеса, пожелания по стилю и где будет использоваться логотип.'},
    'socseti-kontent.html':{service:'Соцсети и контент',text:'Страница услуги: соцсети и контент. Нужно уточнить ссылку на группу, что оформить, сколько постов и какие услуги продвигать.'},
    'yandex-karty-2gis.html':{service:'Яндекс Карты и 2ГИС',text:'Страница услуги: Яндекс Карты и 2ГИС. Нужно уточнить название организации, город, ссылку на карточку и что нужно заполнить или исправить.'}
  };
  const relatedMap={
    'bannery-borisoglebsk.html':[
      ['🎨','Дизайн макета','Если готового макета нет, подготовим баннер под печать.','dizayn-maketov.html'],
      ['🏷️','Таблички','Режим работы, указатели и информационные таблички для входа.','tablichki-borisoglebsk.html'],
      ['🪟','Наклейки на витрину','Логотип, акции, услуги и оформление стекла.','nakleyki-plotternaya-rezka-borisoglebsk.html'],
      ['📍','Яндекс Карты и 2ГИС','Чтобы клиенты не только видели баннер, но и находили вас в поиске.','yandex-karty-2gis.html'],
      ['📱','Посты для ВК','Чтобы акция работала не только на улице, но и в соцсетях.','socseti-kontent.html']
    ],
    'vyveski-borisoglebsk.html':[
      ['🧱','Баннер','Временная реклама на время открытия или акции.','bannery-borisoglebsk.html'],
      ['🏷️','Таблички','Режим работы, указатели, предупреждающие и информационные таблички.','tablichki-borisoglebsk.html'],
      ['🪟','Оформление витрины','Наклейки на стекло, услуги, акции и логотип.','oformlenie-vitrin-borisoglebsk.html'],
      ['🎨','Дизайн макета','Подготовим аккуратный макет вывески или входной группы.','dizayn-maketov.html'],
      ['📍','Карты','Оформим карточку компании, чтобы вас находили по району.','yandex-karty-2gis.html']
    ],
    'nakleyki-plotternaya-rezka-borisoglebsk.html':[
      ['🪟','Оформление витрин','Комплексное оформление стекла, входа и акций.','oformlenie-vitrin-borisoglebsk.html'],
      ['🏷️','Таблички','Режим работы, адрес, навигация и информационные таблички.','tablichki-borisoglebsk.html'],
      ['🎨','Дизайн макета','Подготовим файл для резки или печати.','dizayn-maketov.html'],
      ['🧱','Баннеры','Для акций, фасада, забора или открытия.','bannery-borisoglebsk.html'],
      ['📱','Соцсети','Посты и изображения, чтобы акция работала онлайн.','socseti-kontent.html']
    ],
    'tablichki-borisoglebsk.html':[
      ['✂️','Наклейки','Режим работы, логотип и надписи на дверь или стекло.','nakleyki-plotternaya-rezka-borisoglebsk.html'],
      ['💡','Вывески','Если нужна более заметная входная группа.','vyveski-borisoglebsk.html'],
      ['🎨','Дизайн макета','Сделаем аккуратный макет таблички.','dizayn-maketov.html'],
      ['📍','Яндекс Карты и 2ГИС','Чтобы клиент находил не только вход, но и вашу карточку в поиске.','yandex-karty-2gis.html'],
      ['🧩','Комплект для бизнеса','Подберём набор рекламы для точки.','reklama-dlya-biznesa.html']
    ],
    'dizayn-maketov.html':[
      ['🧱','Баннеры','Макет можно сразу подготовить под печать баннера.','bannery-borisoglebsk.html'],
      ['✂️','Наклейки','Дизайн для стекла, витрины, двери или авто.','nakleyki-plotternaya-rezka-borisoglebsk.html'],
      ['🏷️','Таблички','Макет режима работы, указателя или офисной таблички.','tablichki-borisoglebsk.html'],
      ['📱','Соцсети','Адаптация макета под посты, обложку и аватар.','socseti-kontent.html'],
      ['⭐','Логотип и стиль','Если нужен единый визуальный образ бизнеса.','logotip-firmennyy-stil.html']
    ],
    'socseti-kontent.html':[
      ['📍','Яндекс Карты и 2ГИС','Локальный поиск вместе с соцсетями даёт больше доверия.','yandex-karty-2gis.html'],
      ['⭐','Логотип и стиль','Оформление группы лучше работает с единым стилем.','logotip-firmennyy-stil.html'],
      ['🎨','Дизайн макетов','Изображения для постов, акций и обложек.','dizayn-maketov.html'],
      ['🧱','Баннеры','Акцию можно продублировать офлайн.','bannery-borisoglebsk.html'],
      ['🧩','Реклама для бизнеса','Подберём комплект под тип бизнеса.','reklama-dlya-biznesa.html']
    ],
    'yandex-karty-2gis.html':[
      ['📱','Соцсети и контент','Карты и соцсети вместе усиливают доверие.','socseti-kontent.html'],
      ['⭐','Логотип и стиль','Нужны аккуратные фото, логотип и единое оформление.','logotip-firmennyy-stil.html'],
      ['🏷️','Таблички','Поможем клиенту найти вход уже на месте.','tablichki-borisoglebsk.html'],
      ['💡','Вывески','Сделаем точку заметнее для посетителей.','vyveski-borisoglebsk.html'],
      ['🧩','Реклама для бизнеса','Подберём минимальный комплект продвижения.','reklama-dlya-biznesa.html']
    ],
    'pechat-na-plenke-borisoglebsk.html':[
      ['🪟','Оформление витрин','Акции, услуги, логотип и элементы на стекле.','oformlenie-vitrin-borisoglebsk.html'],
      ['✂️','Плоттерная резка','Надписи без фона, режим работы, логотипы.','nakleyki-plotternaya-rezka-borisoglebsk.html'],
      ['🎨','Дизайн макета','Подготовим файл под печать на плёнке.','dizayn-maketov.html'],
      ['🏷️','Таблички','Дополнить оформление входа и точки.','tablichki-borisoglebsk.html'],
      ['📱','Соцсети','Подготовим посты с акциями или открытием.','socseti-kontent.html']
    ],
    'oformlenie-vitrin-borisoglebsk.html':[
      ['✂️','Наклейки','Логотип, режим работы и надписи без фона.','nakleyki-plotternaya-rezka-borisoglebsk.html'],
      ['💡','Вывески','Сделать вход заметнее с улицы.','vyveski-borisoglebsk.html'],
      ['🧱','Баннер','Акция или открытие рядом с витриной.','bannery-borisoglebsk.html'],
      ['🎨','Дизайн макета','Соберём аккуратную композицию для стекла.','dizayn-maketov.html'],
      ['📍','Карты','Чтобы клиент находил точку в поиске и навигации.','yandex-karty-2gis.html']
    ],
    'logotip-firmennyy-stil.html':[
      ['🎨','Дизайн макетов','Применим стиль в баннерах, листовках и постах.','dizayn-maketov.html'],
      ['📱','Соцсети','Оформим группу в едином стиле.','socseti-kontent.html'],
      ['📍','Яндекс Карты и 2ГИС','Оформим карточку компании аккуратно и единообразно.','yandex-karty-2gis.html'],
      ['💡','Вывески','Применим логотип на входной группе.','vyveski-borisoglebsk.html'],
      ['🧩','Реклама для бизнеса','Подберём комплект с новым стилем.','reklama-dlya-biznesa.html']
    ],
    'outdoor-advertising-borisoglebsk.html':[
      ['🧱','Баннеры','Для фасада, забора, акции или открытия.','bannery-borisoglebsk.html'],
      ['💡','Вывески','Для постоянной заметности точки.','vyveski-borisoglebsk.html'],
      ['🏷️','Таблички','Режим работы, указатели и навигация.','tablichki-borisoglebsk.html'],
      ['✂️','Наклейки','Оформление стекла, двери или витрины.','nakleyki-plotternaya-rezka-borisoglebsk.html'],
      ['🎨','Дизайн макета','Подготовим макет для изготовления.','dizayn-maketov.html']
    ]
  };
  window.LEADER_METRIKA_ID=METRIKA_ID;
  window.leaderGoal=function(name,params){params=params||{};try{if(typeof window.ym==='function')window.ym(METRIKA_ID,'reachGoal',name,params)}catch(e){}try{window.dispatchEvent(new CustomEvent('leader:goal',{detail:{goal:name,params:params}}))}catch(e){}};
  function goal(n,p){if(window.leaderGoal)window.leaderGoal(n,p||{})}
  function qs(){const p=new URLSearchParams(location.search);return{utm_source:p.get('utm_source')||'',utm_medium:p.get('utm_medium')||'',utm_campaign:p.get('utm_campaign')||'',utm_term:p.get('utm_term')||'',utm_content:p.get('utm_content')||'',scenario:p.get('scenario')||'',service:p.get('service')||''}}
  function pageKey(){return (location.pathname.split('/').pop()||'index.html').toLowerCase()}
  function homeOnly(){return location.pathname==='/'||location.pathname.endsWith('/index.html')}
  function uid(p){return p+'-'+Math.random().toString(36).slice(2,9)}
  function sourceGuess(){const u=qs();if(u.utm_source)return u.utm_source;if(document.referrer){try{return new URL(document.referrer).hostname}catch(e){}}return 'Сайт'}
  function loadMetrika(){if(window.__leaderMetrikaLoaded)return;window.__leaderMetrikaLoaded=true;(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');window.ym(METRIKA_ID,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});const ns=document.createElement('noscript');ns.innerHTML='<div><img src="https://mc.yandex.ru/watch/'+METRIKA_ID+'" style="position:absolute; left:-9999px;" alt="" /></div>';document.body.appendChild(ns)}
  function card(icon,title,text,href){return `<article class="card"><div class="icon">${icon}</div><h3>${title}</h3><p>${text}</p><a href="${href}">Подробнее →</a></article>`}
  function injectRelatedServices(){const items=relatedMap[pageKey()];if(!items||document.getElementById('related-services'))return;const anchor=document.getElementById('request')||document.querySelector('main');if(!anchor)return;const section=document.createElement('section');section.id='related-services';section.className='soft';section.innerHTML=`<div class="container"><div class="section-head"><h2>С этим часто заказывают</h2><p>Один рекламный элемент часто работает лучше в связке с другими материалами. Так можно усилить эффект и увеличить количество обращений.</p></div><div class="grid3">${items.map(i=>card(i[0],i[1],i[2],i[3])).join('')}</div></div>`;anchor.parentNode.insertBefore(section,anchor)}
  function injectServiceLinks(){if(!homeOnly()||document.getElementById('service-pages'))return;const services=document.getElementById('services');if(!services)return;const section=document.createElement('section');section.id='service-pages';section.className='soft';section.innerHTML=`<div class="container"><div class="section-head"><h2>Популярные услуги отдельно</h2><p>Выберите конкретное направление, чтобы быстрее понять варианты, цены, примеры и оставить заявку на нужную услугу.</p></div><div class="grid3">
${card('🧩','Реклама для бизнеса','Подбор рекламы по ситуации: магазин, кафе, салон, сервис, пункт выдачи, стройка или частный мастер.','reklama-dlya-biznesa.html')}
${card('🧭','Как проходит заказ','Понятная схема: заявка, уточнение, расчёт, макет, согласование, выполнение и передача результата.','kak-prohodit-zakaz.html')}
${card('❓','Вопросы и ответы','Частые вопросы: как считается цена, что делать без макета, можно ли заказать онлайн и какие данные нужны.','faq.html')}
${card('🖼️','Примеры работ','Портфолио и направления: баннеры, наклейки, таблички, витрины, дизайн, соцсети и карты.','portfolio.html')}
${card('💰','Цены и ориентиры','Понятно объясняем, от чего зависит стоимость баннеров, наклеек, табличек, дизайна и онлайн-услуг.','prices.html')}
${card('🏙️','Наружная реклама','Баннеры, вывески, таблички, указатели и оформление входной группы в Борисоглебске.','outdoor-advertising-borisoglebsk.html')}
${card('🧱','Баннеры','Рекламные баннеры для фасада, забора, акции, открытия, стройки или мероприятия.','bannery-borisoglebsk.html')}
${card('💡','Вывески','Вывески для магазинов, офисов, кафе, сервисов, пунктов выдачи и входных групп.','vyveski-borisoglebsk.html')}
${card('🖨️','Печать на плёнке','Самоклеящаяся плёнка для витрин, дверей, стекла, авто, оборудования и рекламы.','pechat-na-plenke-borisoglebsk.html')}
${card('🪟','Оформление витрин','Наклейки на стекло, режим работы, акции, логотипы, услуги и оформление входа.','oformlenie-vitrin-borisoglebsk.html')}
${card('✂️','Наклейки и плоттерная резка','Надписи без фона, режим работы, стикеры, наклейки на стекло, витрину и авто.','nakleyki-plotternaya-rezka-borisoglebsk.html')}
${card('🏷️','Таблички','Режим работы, адресные, офисные и информационные таблички.','tablichki-borisoglebsk.html')}
${card('🎨','Дизайн макетов','Макеты для баннеров, листовок, визиток, постов, вывесок, презентаций и КП.','dizayn-maketov.html')}
${card('⭐','Логотип и фирменный стиль','Логотип, фирменные цвета, базовая упаковка бизнеса, соцсети и рекламные материалы.','logotip-firmennyy-stil.html')}
${card('📱','Соцсети и контент','Оформление ВК и Одноклассников, посты, изображения, тексты и контент-планы.','socseti-kontent.html')}
${card('📍','Яндекс Карты и 2ГИС','Создание, заполнение и оформление карточки компании для локального поиска.','yandex-karty-2gis.html')}
</div></div>`;services.insertAdjacentElement('afterend',section)}
  function injectBusinessScenarios(){if(!homeOnly()||document.getElementById('business-scenarios'))return;const target=document.getElementById('service-pages')||document.getElementById('services');if(!target)return;const section=document.createElement('section');section.id='business-scenarios';section.innerHTML=`<div class="container"><div class="section-head"><h2>Что заказать для вашего бизнеса</h2><p>Не обязательно разбираться в материалах и форматах. Выберите ситуацию — мы подскажем оптимальный набор рекламы.</p></div><div class="grid3"><article class="card"><div class="icon">🏪</div><h3>Открываете магазин</h3><p>Вывеска или баннер, режим работы, наклейки на витрину, указатели, оформление Яндекс Карт и 2ГИС, первые рекламные посты.</p><a data-scenario="shop" href="#request">Подобрать рекламу для магазина →</a></article><article class="card"><div class="icon">☕</div><h3>Кафе, доставка, общепит</h3><p>Меню, наклейки, баннеры с акциями, оформление соцсетей, карточки в картах, изображения для постов и объявлений.</p><a data-scenario="cafe" href="#request">Подобрать для кафе →</a></article><article class="card"><div class="icon">🛠️</div><h3>Сервис, ремонт, мастерская</h3><p>Фасадная реклама, указатели, таблички, наклейки, прайс услуг, посты, карточки в картах и понятные тексты.</p><a data-scenario="service" href="#request">Подобрать для сервиса →</a></article><article class="card"><div class="icon">💇</div><h3>Салон, студия, частный мастер</h3><p>Логотип, прайс, подарочные сертификаты, оформление ВК, посты, карточка в Яндекс Картах, табличка на вход.</p><a data-scenario="beauty" href="#request">Подобрать для услуг →</a></article><article class="card"><div class="icon">🏗️</div><h3>Строительство и недвижимость</h3><p>Баннеры на объект, презентации, коммерческие предложения, листовки, рекламные макеты и оформление соцсетей.</p><a data-scenario="construction" href="#request">Подобрать для объекта →</a></article><article class="card"><div class="icon">📦</div><h3>Пункт выдачи или офис</h3><p>Таблички, режим работы, навигация, наклейки на дверь, указатели, информационные материалы и оформление карточки в картах.</p><a data-scenario="office" href="#request">Подобрать для точки →</a></article></div></div>`;target.insertAdjacentElement('afterend',section)}
  function applyScenario(key,scroll){const s=scenarios[key];if(!s)return;document.querySelectorAll('[data-leader-lead-widget]').forEach(form=>{const service=form.querySelector('[name="service"]'),message=form.querySelector('[name="message"]');if(service)service.value=s.service;if(message&&!message.value.trim())message.value=s.text;else if(message&&!message.value.includes('Сценарий:'))message.value=s.text+'\n'+message.value});if(scroll)scrollToForm()}
  function applyServicePreset(preset,scroll){if(!preset)return;document.querySelectorAll('[data-leader-lead-widget]').forEach(form=>{const service=form.querySelector('[name="service"]'),message=form.querySelector('[name="message"]');if(service&&preset.service)service.value=preset.service;if(message&&preset.text&&!message.value.trim())message.value=preset.text});if(scroll)scrollToForm()}
  function scrollToForm(){const req=document.getElementById('request')||document.getElementById('leader-lead-form')||document.querySelector('[data-leader-lead-form]');if(req)req.scrollIntoView({behavior:'smooth',block:'start'})}
  function currentPreset(){const q=qs();if(q.service)return{service:q.service,text:'Услуга выбрана по ссылке: '+q.service};return servicePresets[pageKey()]||null}
  function injectServiceSchema(){if(!homeOnly()||document.getElementById('leader-service-schema'))return;const services=['Наружная реклама','Баннеры','Вывески','Печать на плёнке','Наклейки и плоттерная резка','Таблички','Оформление витрин','Дизайн рекламных макетов','Логотип и фирменный стиль','Оформление соцсетей и контент','Яндекс Карты и 2ГИС'];const data={"@context":"https://schema.org","@type":"ItemList","name":"Услуги РА Лидер","url":"https://www.lider-bsk.ru/","itemListElement":services.map((name,i)=>({"@type":"ListItem","position":i+1,"item":{"@type":"Service","name":name,"provider":{"@type":"LocalBusiness","name":"РА Лидер","telephone":"+79802457471"}}}))};const s=document.createElement('script');s.id='leader-service-schema';s.type='application/ld+json';s.textContent=JSON.stringify(data);document.head.appendChild(s)}
  function mount(target){const id=uid('ll');target.innerHTML=`<form class="leader-lead-widget" data-leader-lead-widget><h3>Быстрая заявка</h3><p>Заполните коротко. Мы сами уточним детали, если данных будет недостаточно.</p><input class="leader-lead-hp" name="website" tabindex="-1" autocomplete="off"><div class="leader-lead-grid"><div class="leader-lead-span-6"><label for="${id}-name">Имя / организация</label><input id="${id}-name" name="name" maxlength="200" placeholder="Например, Алексей"></div><div class="leader-lead-span-6"><label for="${id}-phone">Телефон</label><input id="${id}-phone" name="phone" maxlength="80" placeholder="+7..." required></div><div class="leader-lead-span-12"><label for="${id}-service">Что нужно?</label><select id="${id}-service" name="service"><option>Баннер</option><option>Наклейки</option><option>Табличка</option><option>Печать на плёнке</option><option>Плоттерная резка</option><option>Вывеска / наружная реклама</option><option>Дизайн макета</option><option>Соцсети и контент</option><option>Яндекс Карты и 2ГИС</option><option>Логотип / фирменный стиль</option><option>Комплексная реклама</option><option>Другое</option></select></div><div class="leader-lead-span-12"><label for="${id}-message">Коротко опишите задачу</label><textarea id="${id}-message" name="message" maxlength="2000" rows="3" placeholder="Например: нужен баннер для магазина, примерно 2×1 м, макета нет"></textarea></div></div><button class="leader-lead-more" type="button" data-leader-more>Добавить подробности для точного расчёта ↓</button><div class="leader-lead-details" data-leader-details hidden><div class="leader-lead-grid"><div class="leader-lead-span-6"><label for="${id}-city">Город</label><input id="${id}-city" name="city" maxlength="120" placeholder="Борисоглебск"></div><div class="leader-lead-span-6"><label for="${id}-contact">Как удобнее связаться?</label><select id="${id}-contact" name="contact_method"><option>Позвонить</option><option>Написать ВКонтакте</option><option>Написать в MAX</option><option>Написать в WhatsApp</option><option>Написать в Telegram</option><option>Написать на email</option></select></div><div class="leader-lead-span-3"><label for="${id}-width">Ширина, м</label><input id="${id}-width" name="width" inputmode="decimal" placeholder="3"></div><div class="leader-lead-span-3"><label for="${id}-height">Высота, м</label><input id="${id}-height" name="height" inputmode="decimal" placeholder="1"></div><div class="leader-lead-span-6"><label for="${id}-quantity">Количество</label><input id="${id}-quantity" name="quantity" maxlength="120" placeholder="1 шт., 10 шт., 100 наклеек"></div><div class="leader-lead-span-6"><label for="${id}-deadline">Когда нужно?</label><select id="${id}-deadline" name="deadline"><option>Не срочно</option><option>Как можно быстрее</option><option>В течение 2–3 дней</option><option>В течение недели</option><option>К определённой дате</option><option>Нужно обсудить</option></select></div><div class="leader-lead-span-6"><label for="${id}-mockup">Макет</label><select id="${id}-mockup" name="mockup"><option>Макета нет, нужен дизайн</option><option>Макет готов</option><option>Есть пример, нужно доработать</option><option>Пока не знаю</option></select></div><div class="leader-lead-span-6"><label for="${id}-delivery">Доставка / монтаж</label><select id="${id}-delivery" name="delivery"><option>Не требуется</option><option>Нужна доставка</option><option>Нужен монтаж</option><option>Доставка и монтаж</option><option>Нужно обсудить</option></select></div></div></div><button type="submit">Отправить заявку</button><div class="leader-lead-note">Нажимая кнопку, вы соглашаетесь на обработку данных для связи и расчёта заказа.</div><div class="leader-lead-status" data-leader-lead-status></div></form>`;const form=target.querySelector('form'),more=form.querySelector('[data-leader-more]'),details=form.querySelector('[data-leader-details]');more.addEventListener('click',()=>{if(details.hasAttribute('hidden')){details.removeAttribute('hidden');more.textContent='Скрыть подробности ↑';goal('form_details_open',{page:location.href})}else{details.setAttribute('hidden','');more.textContent='Добавить подробности для точного расчёта ↓'}});form.addEventListener('submit',submit)}
  function field(form,name){const el=form.querySelector('[name="'+name+'"]');return el?el.value.trim():''}
  function setStatus(form,type,msg){const s=form.querySelector('[data-leader-lead-status]');if(s){s.className='leader-lead-status show '+type;s.textContent=msg}}
  async function submit(e){e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');if(field(form,'website'))return;const name=field(form,'name'),phone=field(form,'phone'),service=field(form,'service'),message=field(form,'message'),city=field(form,'city'),contact_method=field(form,'contact_method'),width=field(form,'width'),height=field(form,'height'),quantity=field(form,'quantity'),deadline=field(form,'deadline'),mockup=field(form,'mockup'),delivery=field(form,'delivery');if(!phone){setStatus(form,'err','Укажите телефон, чтобы мы могли связаться с вами.');return}const parts=[];if(message)parts.push('Задача: '+message);if(city)parts.push('Город: '+city);if(contact_method)parts.push('Связь: '+contact_method);if(width||height)parts.push('Размеры: '+(width||'-')+'×'+(height||'-')+' м');if(quantity)parts.push('Количество: '+quantity);if(deadline)parts.push('Срок: '+deadline);if(mockup)parts.push('Макет: '+mockup);if(delivery)parts.push('Доставка/монтаж: '+delivery);const utm=qs();const payload={name,phone,service,source:sourceGuess(),message:parts.join('\n')||'Клиент оставил быструю заявку без подробного описания.',page_url:location.href,city,width,height,quantity,contact_method,deadline,mockup,delivery,...utm,website:''};btn.disabled=true;btn.textContent='Отправляем...';goal('form_submit_attempt',{service,page:location.href});try{const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error('Ошибка '+res.status);setStatus(form,'ok','Заявка отправлена. Мы свяжемся с вами для уточнения деталей.');goal('lead_sent',{service,page:location.href});form.reset()}catch(err){console.error(err);setStatus(form,'err','Не удалось отправить заявку. Позвоните нам или попробуйте ещё раз.');goal('lead_send_error',{service,page:location.href})}finally{btn.disabled=false;btn.textContent='Отправить заявку'}}
  function initClicks(){document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a');if(!a)return;const href=a.getAttribute('href')||'',text=(a.textContent||'').trim();if(href.indexOf('tel:')===0)goal('phone_click',{href,text,page:location.href});if(a.dataset&&a.dataset.service){e.preventDefault();applyServicePreset({service:a.dataset.service,text:'Услуга выбрана кнопкой: '+a.dataset.service},true)}if(a.dataset&&a.dataset.scenario){e.preventDefault();applyScenario(a.dataset.scenario,true)}if(/\.html($|#|\?)/.test(href))goal('service_page_click',{href,text,page:location.href})})}
  function init(){loadMetrika();injectServiceSchema();initClicks();injectServiceLinks();injectBusinessScenarios();injectRelatedServices();document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount);const s=qs().scenario;if(s)applyScenario(s,false);else applyServicePreset(currentPreset(),false)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
