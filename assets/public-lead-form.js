// RA Lider public lead form, metrika goals, prefill, mobile sticky CTA and page helpers.
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
    'srochnaya-reklama-borisoglebsk.html':{service:'Комплексная реклама',text:'Срочная заявка: нужно быстро рассчитать рекламу. Срок: '},
    'reklama-v-socsetyah-borisoglebsk.html':{service:'Соцсети и контент',text:'Страница: реклама в соцсетях Борисоглебска. Нужно уточнить, что рекламируем, дату размещения, материалы и цель.'},
    'reklama-v-soobshchestvah-borisoglebska.html':{service:'Соцсети и контент',text:'Страница: реклама в сообществах Борисоглебска ВК/ОК. Нужно уточнить товар/услугу, сроки, формат размещения, готовность текста/изображения и желаемые сообщества.'},
    'reklama-dlya-meropriyatiy-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама мероприятия. Нужно уточнить дату, место, афишу, условия входа, контакты и желаемые размещения.'},
    'reklama-dlya-kafe-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для кафе / доставки. Нужно уточнить меню, акции, адрес, график, соцсети, карты и нужные макеты.'},
    'reklama-dlya-salona-krasoty-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для салона / мастера. Нужно уточнить услуги, прайс, соцсети, карты, сертификаты, таблички, наклейки и оформление.'},
    'reklama-dlya-servisa-masterskoy-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для сервиса / мастерской. Нужно уточнить услуги, прайс, вход, вывеску, таблички, соцсети, карты, сроки и нужные макеты.'},
    'reklama-dlya-magazina-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для магазина. Нужно уточнить вход, витрину, баннер, режим работы, карты, соцсети и макеты.'},
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
    'yandex-karty-2gis.html':{service:'Яндекс Карты и 2ГИС',text:'Страница услуги: Яндекс Карты и 2ГИС. Нужно уточнить название организации, город, ссылку на карточку и что нужно заполнить или исправить.'},
    'primery-rabot-kejsy.html':{service:'Комплексная реклама',text:'Страница: примеры работ и кейсы. Клиент хочет похожую рекламу. Нужно уточнить, какой пример понравился, формат, размеры, место размещения, сроки и материалы.'}
  };

  window.LEADER_METRIKA_ID=METRIKA_ID;
  window.leaderGoal=function(name,params){
    params=params||{};
    try{if(typeof window.ym==='function')window.ym(METRIKA_ID,'reachGoal',name,params)}catch(e){}
    try{window.dispatchEvent(new CustomEvent('leader:goal',{detail:{goal:name,params:params}}))}catch(e){}
  };

  function goal(n,p){if(window.leaderGoal)window.leaderGoal(n,p||{})}
  function pageKey(){return (location.pathname.split('/').pop()||'index.html').toLowerCase()}
  function homeOnly(){return location.pathname==='/'||location.pathname.endsWith('/index.html')}
  function uid(p){return p+'-'+Math.random().toString(36).slice(2,9)}
  function qs(){const p=new URLSearchParams(location.search);return{utm_source:p.get('utm_source')||'',utm_medium:p.get('utm_medium')||'',utm_campaign:p.get('utm_campaign')||'',utm_term:p.get('utm_term')||'',utm_content:p.get('utm_content')||'',scenario:p.get('scenario')||'',service:p.get('service')||''}}
  function sourceGuess(){const u=qs();if(u.utm_source)return u.utm_source;if(document.referrer){try{return new URL(document.referrer).hostname}catch(e){}}return 'Сайт'}

  function loadMetrika(){
    if(window.__leaderMetrikaLoaded)return;
    window.__leaderMetrikaLoaded=true;
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');
    window.ym(METRIKA_ID,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});
  }

  function scrollToForm(){const req=document.getElementById('request')||document.getElementById('leader-lead-form')||document.querySelector('[data-leader-lead-form]');if(req)req.scrollIntoView({behavior:'smooth',block:'start'});}
  function applyServicePreset(preset,scroll){if(!preset)return;document.querySelectorAll('[data-leader-lead-widget]').forEach(form=>{const service=form.querySelector('[name="service"]'),message=form.querySelector('[name="message"]');if(service&&preset.service)service.value=preset.service;if(message&&preset.text&&!message.value.trim())message.value=preset.text;});if(scroll)scrollToForm();}
  function applyScenario(key,scroll){const s=scenarios[key];if(!s)return;applyServicePreset(s,scroll);}
  function currentPreset(){const q=qs();if(q.service)return{service:q.service,text:'Услуга выбрана по ссылке: '+q.service};return servicePresets[pageKey()]||null;}
  function field(form,name){const el=form.querySelector('[name="'+name+'"]');return el?el.value.trim():''}
  function setStatus(form,type,msg){const s=form.querySelector('[data-leader-lead-status]');if(s){s.className='leader-lead-status show '+type;s.textContent=msg}}

  function mount(target){
    if(target.dataset.leaderMounted==='1')return;
    target.dataset.leaderMounted='1';
    const id=uid('ll');
    target.innerHTML=`<form class="leader-lead-widget" data-leader-lead-widget><h3>Быстрая заявка</h3><p>Заполните коротко. Мы сами уточним детали, если данных будет недостаточно.</p><input class="leader-lead-hp" name="website" tabindex="-1" autocomplete="off"><div class="leader-lead-grid"><div class="leader-lead-span-6"><label for="${id}-name">Имя / организация</label><input id="${id}-name" name="name" maxlength="200" placeholder="Например, Алексей"></div><div class="leader-lead-span-6"><label for="${id}-phone">Телефон</label><input id="${id}-phone" name="phone" maxlength="80" placeholder="+7..." required></div><div class="leader-lead-span-12"><label for="${id}-service">Что нужно?</label><select id="${id}-service" name="service"><option>Баннер</option><option>Наклейки</option><option>Табличка</option><option>Печать на плёнке</option><option>Плоттерная резка</option><option>Вывеска / наружная реклама</option><option>Дизайн макета</option><option>Соцсети и контент</option><option>Яндекс Карты и 2ГИС</option><option>Логотип / фирменный стиль</option><option>Комплексная реклама</option><option>Другое</option></select></div><div class="leader-lead-span-12"><label for="${id}-message">Коротко опишите задачу</label><textarea id="${id}-message" name="message" maxlength="2000" rows="3" placeholder="Например: нужен рекламный пост, баннер или наклейки"></textarea></div></div><button class="leader-lead-more" type="button" data-leader-more>Добавить подробности для точного расчёта ↓</button><div class="leader-lead-details" data-leader-details hidden><div class="leader-lead-grid"><div class="leader-lead-span-6"><label for="${id}-city">Город</label><input id="${id}-city" name="city" maxlength="120" placeholder="Борисоглебск"></div><div class="leader-lead-span-6"><label for="${id}-contact">Как удобнее связаться?</label><select id="${id}-contact" name="contact_method"><option>Позвонить</option><option>Написать ВКонтакте</option><option>Написать в MAX</option><option>Написать в WhatsApp</option><option>Написать в Telegram</option><option>Написать на email</option></select></div><div class="leader-lead-span-6"><label for="${id}-quantity">Количество / формат</label><input id="${id}-quantity" name="quantity" maxlength="120" placeholder="1 пост, пакет, закреп, 100 наклеек"></div><div class="leader-lead-span-6"><label for="${id}-deadline">Когда нужно?</label><select id="${id}-deadline" name="deadline"><option>Не срочно</option><option>Как можно быстрее</option><option>В течение 2–3 дней</option><option>В течение недели</option><option>К определённой дате</option><option>Нужно обсудить</option></select></div><div class="leader-lead-span-6"><label for="${id}-mockup">Макет</label><select id="${id}-mockup" name="mockup"><option>Макета нет, нужен дизайн</option><option>Макет готов</option><option>Есть пример, нужно доработать</option><option>Пока не знаю</option></select></div><div class="leader-lead-span-6"><label for="${id}-delivery">Доставка / монтаж</label><select id="${id}-delivery" name="delivery"><option>Не требуется</option><option>Нужна доставка</option><option>Нужен монтаж</option><option>Доставка и монтаж</option><option>Нужно обсудить</option></select></div></div></div><button type="submit">Отправить заявку</button><div class="leader-lead-note">Нажимая кнопку, вы соглашаетесь на обработку данных для связи и расчёта заказа.</div><div class="leader-lead-status" data-leader-lead-status></div></form>`;
    const form=target.querySelector('form'),more=form.querySelector('[data-leader-more]'),details=form.querySelector('[data-leader-details]');
    more.addEventListener('click',()=>{if(details.hasAttribute('hidden')){details.removeAttribute('hidden');more.textContent='Скрыть подробности ↑';goal('form_details_open',{page:location.href})}else{details.setAttribute('hidden','');more.textContent='Добавить подробности для точного расчёта ↓'}});
    form.addEventListener('submit',submit);
  }

  async function submit(e){
    e.preventDefault();const form=e.currentTarget,btn=form.querySelector('button[type="submit"]');if(field(form,'website'))return;
    const name=field(form,'name'),phone=field(form,'phone'),service=field(form,'service'),message=field(form,'message'),city=field(form,'city'),contact_method=field(form,'contact_method'),quantity=field(form,'quantity'),deadline=field(form,'deadline'),mockup=field(form,'mockup'),delivery=field(form,'delivery');
    if(!phone){setStatus(form,'err','Укажите телефон, чтобы мы могли связаться с вами.');return}
    const parts=[];if(message)parts.push('Задача: '+message);if(city)parts.push('Город: '+city);if(contact_method)parts.push('Связь: '+contact_method);if(quantity)parts.push('Количество/формат: '+quantity);if(deadline)parts.push('Срок: '+deadline);if(mockup)parts.push('Макет: '+mockup);if(delivery)parts.push('Доставка/монтаж: '+delivery);
    const utm=qs();const payload={name,phone,service,source:sourceGuess(),message:parts.join('\n')||'Клиент оставил быструю заявку без подробного описания.',page_url:location.href,city,quantity,contact_method,deadline,mockup,delivery,...utm,website:''};
    btn.disabled=true;btn.textContent='Отправляем...';goal('form_submit_attempt',{service,page:location.href});
    try{const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok)throw new Error('Ошибка '+res.status);setStatus(form,'ok','Заявка отправлена. Мы свяжемся с вами для уточнения деталей.');goal('lead_sent',{service,page:location.href});form.reset()}catch(err){console.error(err);setStatus(form,'err','Не удалось отправить заявку. Позвоните нам или попробуйте ещё раз.');goal('lead_send_error',{service,page:location.href})}finally{btn.disabled=false;btn.textContent='Отправить заявку'}
  }

  function injectMobileStickyCta(){
    if(document.getElementById('leader-mobile-sticky-cta'))return;if(homeOnly()&&document.querySelector('.mobile-cta'))return;
    const request=document.getElementById('request')||document.getElementById('leader-lead-form')||document.querySelector('[data-leader-lead-form]');const requestHref=request?'#'+(request.id||'request'):'/#request';
    const style=document.createElement('style');style.id='leader-mobile-sticky-cta-style';style.textContent='@media(max-width:760px){body{padding-bottom:76px}.leader-mobile-sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;gap:8px;padding:10px 12px;background:rgba(255,255,255,.96);border-top:1px solid #e5e7eb;box-shadow:0 -12px 30px rgba(15,23,42,.14);backdrop-filter:blur(12px)}.leader-mobile-sticky-cta a{flex:1;min-height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:900}.leader-mobile-sticky-cta__lead{background:#f6c343;color:#111827}.leader-mobile-sticky-cta__phone{background:#111827;color:#fff}}@media(min-width:761px){.leader-mobile-sticky-cta{display:none}}';document.head.appendChild(style);
    const bar=document.createElement('div');bar.id='leader-mobile-sticky-cta';bar.className='leader-mobile-sticky-cta';bar.innerHTML='<a class="leader-mobile-sticky-cta__lead" href="'+requestHref+'">Оставить заявку</a><a class="leader-mobile-sticky-cta__phone" href="tel:+79802457471">Позвонить</a>';document.body.appendChild(bar);
    bar.addEventListener('click',function(e){const a=e.target.closest('a');if(!a)return;goal(a.href.indexOf('tel:')===0?'mobile_phone_click':'mobile_cta_click',{page:location.href});});
  }

  function injectCommunityPrices(){
    if(pageKey()!=='reklama-v-soobshchestvah-borisoglebska.html'||document.getElementById('community-price-block'))return;
    const anchor=document.getElementById('formats')||document.getElementById('communities')||document.getElementById('request');
    if(!anchor)return;
    const style=document.createElement('style');
    style.id='community-price-style';
    style.textContent='.community-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.community-price-card{border:1px solid #e5e7eb;border-radius:24px;padding:24px;background:#fff;box-shadow:0 18px 48px rgba(15,23,42,.10)}.community-price-card.main{border:2px solid #f6c343}.community-price-card h3{margin:0 0 8px;font-size:23px}.community-price-value{font-size:34px;line-height:1;font-weight:900;margin:10px 0;color:#111827}.community-price-card p{color:#667085}.community-price-note{margin-top:18px;background:#fff7d6;border:1px solid #fde68a;border-radius:22px;padding:18px;color:#5a3b00;font-weight:800}@media(max-width:900px){.community-price-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    const section=document.createElement('section');
    section.id='community-price-block';
    section.className='section soft';
    section.innerHTML='<div class="wrap"><h2>Цены на размещение рекламы</h2><p class="lead">Ориентиры по стоимости. Итог зависит от выбранных сообществ, количества публикаций, закрепа, сроков и сложности изображения.</p><div class="community-price-grid"><article class="community-price-card main"><h3>Разовый рекламный пост</h3><div class="community-price-value">от 300 ₽</div><p>Один пост в подходящем сообществе. Подходит для акции, объявления, открытия, услуги или проверки спроса.</p><a class="btn btn-dark" data-service="Соцсети и контент" href="#request">Заказать пост</a></article><article class="community-price-card main"><h3>Пакет размещений</h3><div class="community-price-value">от 1200 ₽</div><p>Несколько публикаций в разных группах или серия выходов по одной теме. Подходит для охвата и мероприятий.</p><a class="btn btn-dark" data-service="Соцсети и контент" href="#request">Подобрать пакет</a></article><article class="community-price-card"><h3>Закреп поста</h3><div class="community-price-value">от 1000 ₽</div><p>Стоимость за неделю, если закреп доступен в выбранном сообществе.</p><a class="btn btn-dark" data-service="Соцсети и контент" href="#request">Уточнить закреп</a></article><article class="community-price-card"><h3>Текст к посту</h3><div class="community-price-value">в подарок</div><p>Подготовим понятный рекламный текст: что предлагаете, где находится, как связаться и почему стоит обратиться сейчас.</p></article><article class="community-price-card"><h3>Простое изображение</h3><div class="community-price-value">бесплатно</div><p>Карточка к посту: заголовок, фото или фон, контакты, цена, акция или дата мероприятия.</p></article><article class="community-price-card"><h3>Сложное изображение</h3><div class="community-price-value">от 300 ₽</div><p>Афиша, коллаж, несколько объектов, обработка фото или более сложная композиция.</p></article></div><div class="community-price-note">Текст к посту и простое изображение можно подготовить без доплаты. Если нужен сложный дизайн или серия разных макетов — рассчитаем отдельно.</div></div>';
    anchor.parentNode.insertBefore(section,anchor);
  }

  function initClicks(){document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a');if(!a)return;const href=a.getAttribute('href')||'',text=(a.textContent||'').trim();if(href.indexOf('tel:')===0)goal('phone_click',{href,text,page:location.href});if(a.dataset&&a.dataset.service){e.preventDefault();applyServicePreset({service:a.dataset.service,text:'Услуга выбрана кнопкой: '+a.dataset.service},true)}if(a.dataset&&a.dataset.scenario){e.preventDefault();applyScenario(a.dataset.scenario,true)}if(/\.html($|#|\?)/.test(href))goal('service_page_click',{href,text,page:location.href});});}
  function init(){loadMetrika();initClicks();document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount);const s=qs().scenario;if(s)applyScenario(s,false);else applyServicePreset(currentPreset(),false);injectCommunityPrices();injectMobileStickyCta();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
