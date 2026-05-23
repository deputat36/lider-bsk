// Public lead form + Yandex Metrika goals for RA Lider.
(function(){
  const ENDPOINT='https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead';
  const METRIKA_ID=109387236;

  window.LEADER_METRIKA_ID=METRIKA_ID;
  window.leaderGoal=function(name,params){
    params=params||{};
    try{ if(typeof window.ym==='function') window.ym(METRIKA_ID,'reachGoal',name,params); }catch(e){ console.warn('leaderGoal failed',name,e); }
    try{ window.dispatchEvent(new CustomEvent('leader:goal',{detail:{goal:name,params:params}})); }catch(e){}
  };

  function loadMetrika(){
    if(window.__leaderMetrikaLoaded) return;
    window.__leaderMetrikaLoaded=true;
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');
    window.ym(METRIKA_ID,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});
    const ns=document.createElement('noscript');
    ns.innerHTML='<div><img src="https://mc.yandex.ru/watch/'+METRIKA_ID+'" style="position:absolute; left:-9999px;" alt="" /></div>';
    document.body.appendChild(ns);
  }

  function goal(name,params){ if(typeof window.leaderGoal==='function') window.leaderGoal(name,params||{}); }
  function qs(){const p=new URLSearchParams(location.search);return{utm_source:p.get('utm_source')||'',utm_medium:p.get('utm_medium')||'',utm_campaign:p.get('utm_campaign')||'',utm_term:p.get('utm_term')||'',utm_content:p.get('utm_content')||''};}
  function sourceGuess(){const u=qs();if(u.utm_source)return u.utm_source;if(document.referrer){try{return new URL(document.referrer).hostname;}catch(e){}}return 'Сайт';}
  function uniqueId(prefix){return prefix+'-'+Math.random().toString(36).slice(2,9);}

  function initClickGoals(){
    document.addEventListener('click',function(e){
      const link=e.target.closest&&e.target.closest('a');
      if(!link)return;
      const href=link.getAttribute('href')||'';
      const text=(link.textContent||'').trim();
      if(href.indexOf('tel:')===0) goal('phone_click',{href,text,page:location.href});
      if(href.indexOf('#request')===0||href.endsWith('/#request')) goal('request_block_click',{text,page:location.href});
      if(/\.html($|#|\?)/.test(href)) goal('service_page_click',{href,text,page:location.href});
    });
  }

  function injectServiceLinks(){
    if(location.pathname!=='/'&&!location.pathname.endsWith('/index.html'))return;
    if(document.getElementById('service-pages'))return;
    const services=document.getElementById('services');
    if(!services)return;
    const section=document.createElement('section');
    section.id='service-pages';
    section.className='soft';
    section.innerHTML=`<div class="container"><div class="section-head"><h2>Популярные услуги отдельно</h2><p>Выберите конкретное направление, чтобы быстрее понять варианты и оставить заявку на нужную услугу.</p></div><div class="grid3"><article class="card"><div class="icon">🏙️</div><h3>Наружная реклама</h3><p>Баннеры, вывески, таблички, указатели и оформление входной группы в Борисоглебске.</p><a href="outdoor-advertising-borisoglebsk.html">Подробнее →</a></article><article class="card"><div class="icon">🧱</div><h3>Баннеры</h3><p>Рекламные баннеры для фасада, забора, акции, открытия, стройки или мероприятия.</p><a href="bannery-borisoglebsk.html">Подробнее →</a></article><article class="card"><div class="icon">✂️</div><h3>Наклейки и плоттерная резка</h3><p>Надписи без фона, режим работы, стикеры, наклейки на стекло, витрину и авто.</p><a href="nakleyki-plotternaya-rezka-borisoglebsk.html">Подробнее →</a></article><article class="card"><div class="icon">🏷️</div><h3>Таблички</h3><p>Режим работы, адресные, офисные, информационные и предупреждающие таблички.</p><a href="tablichki-borisoglebsk.html">Подробнее →</a></article><article class="card"><div class="icon">📱</div><h3>Соцсети и контент</h3><p>Оформление ВК и Одноклассников, посты, изображения, тексты и контент-планы.</p><a href="socseti-kontent.html">Подробнее →</a></article><article class="card"><div class="icon">📍</div><h3>Яндекс Карты и 2ГИС</h3><p>Создание, заполнение и оформление карточки компании для локального поиска.</p><a href="yandex-karty-2gis.html">Подробнее →</a></article></div></div>`;
    services.insertAdjacentElement('afterend',section);
  }

  function mount(target){
    const uid=uniqueId('ll');
    target.innerHTML=`
      <form class="leader-lead-widget" data-leader-lead-widget>
        <h3>Быстрая заявка</h3>
        <p>Заполните коротко. Мы сами уточним детали, если данных будет недостаточно.</p>
        <input class="leader-lead-hp" name="website" tabindex="-1" autocomplete="off">
        <div class="leader-lead-grid">
          <div class="leader-lead-span-6"><label for="${uid}-name">Имя / организация</label><input id="${uid}-name" name="name" maxlength="200" placeholder="Например, Алексей"></div>
          <div class="leader-lead-span-6"><label for="${uid}-phone">Телефон</label><input id="${uid}-phone" name="phone" maxlength="80" placeholder="+7..." required></div>
          <div class="leader-lead-span-12"><label for="${uid}-service">Что нужно?</label><select id="${uid}-service" name="service"><option>Баннер</option><option>Наклейки</option><option>Табличка</option><option>Печать на плёнке</option><option>Плоттерная резка</option><option>Вывеска / наружная реклама</option><option>Дизайн макета</option><option>Соцсети и контент</option><option>Яндекс Карты и 2ГИС</option><option>Логотип / фирменный стиль</option><option>Комплексная реклама</option><option>Другое</option></select></div>
          <div class="leader-lead-span-12"><label for="${uid}-message">Коротко опишите задачу</label><textarea id="${uid}-message" name="message" maxlength="2000" rows="3" placeholder="Например: нужен баннер для магазина, примерно 2×1 м, макета нет"></textarea></div>
        </div>
        <button class="leader-lead-more" type="button" data-leader-more>Добавить подробности для точного расчёта ↓</button>
        <div class="leader-lead-details" data-leader-details hidden><div class="leader-lead-grid">
          <div class="leader-lead-span-6"><label for="${uid}-city">Город</label><input id="${uid}-city" name="city" maxlength="120" placeholder="Борисоглебск"></div>
          <div class="leader-lead-span-6"><label for="${uid}-contact">Как удобнее связаться?</label><select id="${uid}-contact" name="contact_method"><option>Позвонить</option><option>Написать ВКонтакте</option><option>Написать в MAX</option><option>Написать в WhatsApp</option><option>Написать в Telegram</option><option>Написать на email</option></select></div>
          <div class="leader-lead-span-3"><label for="${uid}-width">Ширина, м</label><input id="${uid}-width" name="width" inputmode="decimal" placeholder="3"></div>
          <div class="leader-lead-span-3"><label for="${uid}-height">Высота, м</label><input id="${uid}-height" name="height" inputmode="decimal" placeholder="1"></div>
          <div class="leader-lead-span-6"><label for="${uid}-quantity">Количество</label><input id="${uid}-quantity" name="quantity" maxlength="120" placeholder="1 шт., 10 шт., 100 наклеек"></div>
          <div class="leader-lead-span-6"><label for="${uid}-deadline">Когда нужно?</label><select id="${uid}-deadline" name="deadline"><option>Не срочно</option><option>Как можно быстрее</option><option>В течение 2–3 дней</option><option>В течение недели</option><option>К определённой дате</option><option>Нужно обсудить</option></select></div>
          <div class="leader-lead-span-6"><label for="${uid}-mockup">Макет</label><select id="${uid}-mockup" name="mockup"><option>Макета нет, нужен дизайн</option><option>Макет готов</option><option>Есть пример, нужно доработать</option><option>Пока не знаю</option></select></div>
          <div class="leader-lead-span-6"><label for="${uid}-delivery">Доставка / монтаж</label><select id="${uid}-delivery" name="delivery"><option>Не требуется</option><option>Нужна доставка</option><option>Нужен монтаж</option><option>Доставка и монтаж</option><option>Нужно обсудить</option></select></div>
        </div></div>
        <div class="leader-lead-grid"><div class="leader-lead-span-12"><button type="submit">Отправить заявку</button></div></div>
        <div class="leader-lead-note">Нажимая кнопку, вы соглашаетесь на обработку данных для связи и расчёта заказа.</div>
        <div class="leader-lead-status" data-leader-lead-status></div>
      </form>`;
    const form=target.querySelector('form');
    const more=form.querySelector('[data-leader-more]');
    const details=form.querySelector('[data-leader-details]');
    more.addEventListener('click',function(){const isHidden=details.hasAttribute('hidden');if(isHidden){details.removeAttribute('hidden');more.textContent='Скрыть подробности ↑';goal('form_details_open',{page:location.href});}else{details.setAttribute('hidden','');more.textContent='Добавить подробности для точного расчёта ↓';}});
    form.addEventListener('submit',submit);
  }

  function setStatus(form,type,msg){const s=form.querySelector('[data-leader-lead-status]');if(!s)return;s.className='leader-lead-status show '+type;s.textContent=msg;}
  function field(form,name){const el=form.querySelector('[name="'+name+'"]');return el?el.value.trim():'';}

  async function submit(e){
    e.preventDefault();
    const form=e.currentTarget, btn=form.querySelector('button[type="submit"]');
    if(field(form,'website'))return;
    const name=field(form,'name'), phone=field(form,'phone'), service=field(form,'service'), message=field(form,'message'), city=field(form,'city'), contactMethod=field(form,'contact_method'), width=field(form,'width'), height=field(form,'height'), quantity=field(form,'quantity'), deadline=field(form,'deadline'), mockup=field(form,'mockup'), delivery=field(form,'delivery');
    if(!phone){setStatus(form,'err','Укажите телефон, чтобы мы могли связаться с вами.');goal('form_error_no_phone',{service,page:location.href});return;}
    btn.disabled=true;btn.textContent='Отправляем...';goal('form_submit_attempt',{service,page:location.href});
    const parts=[]; if(message)parts.push('Задача: '+message); if(city)parts.push('Город: '+city); if(contactMethod)parts.push('Связь: '+contactMethod); if(width||height)parts.push('Размеры: '+(width||'-')+'×'+(height||'-')+' м'); if(quantity)parts.push('Количество: '+quantity); if(deadline)parts.push('Срок: '+deadline); if(mockup)parts.push('Макет: '+mockup); if(delivery)parts.push('Доставка/монтаж: '+delivery);
    const utm=qs();
    const payload={name,phone,service,source:sourceGuess(),message:parts.join('\n')||'Клиент оставил быструю заявку без подробного описания.',page_url:location.href,city,width,height,quantity,contact_method:contactMethod,deadline,mockup,delivery,...utm,website:''};
    try{
      const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!res.ok){let text='';try{text=await res.text();}catch(e){}throw new Error('Ошибка '+res.status+' '+text);}
      setStatus(form,'ok','Заявка отправлена. Мы свяжемся с вами для уточнения деталей.');
      goal('lead_sent',{service,page:location.href,detailed:Boolean(city||width||height||quantity||deadline||mockup||delivery)});
      form.reset();
      const details=form.querySelector('[data-leader-details]'), more=form.querySelector('[data-leader-more]');
      if(details&&more){details.setAttribute('hidden','');more.textContent='Добавить подробности для точного расчёта ↓';}
    }catch(err){console.error(err);setStatus(form,'err','Не удалось отправить заявку. Позвоните нам или попробуйте ещё раз.');goal('lead_send_error',{service,page:location.href});}
    finally{btn.disabled=false;btn.textContent='Отправить заявку';}
  }

  function init(){loadMetrika();initClickGoals();injectServiceLinks();document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
