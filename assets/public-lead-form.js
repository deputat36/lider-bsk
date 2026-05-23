// Public lead form for RA Lider website. Sends requests to Supabase Edge Function leader-public-lead.
(function(){
  const ENDPOINT='https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead';
  function qs(){const p=new URLSearchParams(location.search);return{utm_source:p.get('utm_source')||'',utm_medium:p.get('utm_medium')||'',utm_campaign:p.get('utm_campaign')||'',utm_term:p.get('utm_term')||'',utm_content:p.get('utm_content')||''};}
  function sourceGuess(){const u=qs();if(u.utm_source)return u.utm_source;if(document.referrer){try{return new URL(document.referrer).hostname;}catch(e){}}return 'Сайт';}
  function uniqueId(prefix){return prefix+'-'+Math.random().toString(36).slice(2,9);}
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
    target.innerHTML=`<form class="leader-lead-widget" data-leader-lead-widget><h3>Рассчитать стоимость</h3><p>Опишите задачу — уточним детали и подготовим предварительный расчёт.</p><input class="leader-lead-hp" name="website" tabindex="-1" autocomplete="off"><div class="leader-lead-grid"><div class="leader-lead-span-6"><label for="${uid}-name">Имя / организация</label><input id="${uid}-name" name="name" maxlength="200" placeholder="Например, Алексей / ООО Ромашка"></div><div class="leader-lead-span-6"><label for="${uid}-phone">Телефон</label><input id="${uid}-phone" name="phone" maxlength="80" placeholder="+7..." required></div><div class="leader-lead-span-6"><label for="${uid}-service">Услуга</label><select id="${uid}-service" name="service"><option>Баннер</option><option>Наклейки</option><option>Табличка</option><option>Печать на плёнке</option><option>Перфорированная плёнка</option><option>Плоттерная резка</option><option>Дизайн</option><option>Монтаж</option><option>Соцсети и контент</option><option>Яндекс Карты и 2ГИС</option><option>Комплексная реклама</option><option>Другое</option></select></div><div class="leader-lead-span-3"><label for="${uid}-width">Ширина, м</label><input id="${uid}-width" name="width" inputmode="decimal" placeholder="3"></div><div class="leader-lead-span-3"><label for="${uid}-height">Высота, м</label><input id="${uid}-height" name="height" inputmode="decimal" placeholder="1"></div><div class="leader-lead-span-12"><label for="${uid}-message">Что нужно сделать?</label><textarea id="${uid}-message" name="message" maxlength="2000" rows="4" placeholder="Размеры, материал, количество, сроки, нужен ли макет или монтаж..."></textarea></div><div class="leader-lead-span-12"><button type="submit">Отправить заявку</button></div></div><div class="leader-lead-note">Нажимая кнопку, вы соглашаетесь на обработку данных для связи и расчёта заказа.</div><div class="leader-lead-status" data-leader-lead-status></div></form>`;
    target.querySelector('form').addEventListener('submit',submit);
  }
  function setStatus(form,type,msg){const s=form.querySelector('[data-leader-lead-status]');if(!s)return;s.className='leader-lead-status show '+type;s.textContent=msg;}
  function field(form,name){const el=form.querySelector('[name="'+name+'"]');return el?el.value.trim():'';}
  async function submit(e){
    e.preventDefault();const form=e.currentTarget;const btn=form.querySelector('button[type="submit"]');const website=field(form,'website');if(website)return;
    const name=field(form,'name'),phone=field(form,'phone'),service=field(form,'service'),width=field(form,'width'),height=field(form,'height'),message=field(form,'message');
    if(!phone&&!message){setStatus(form,'err','Укажите телефон или опишите задачу.');return;}
    btn.disabled=true;btn.textContent='Отправляем...';
    const utm=qs();const payload={name,phone,service,source:sourceGuess(),message:[message,width||height?('Размеры: '+(width||'-')+'×'+(height||'-')+' м'):''].filter(Boolean).join('\n'),page_url:location.href,width,height,...utm,website};
    try{const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!res.ok){let text='';try{text=await res.text();}catch(e){}throw new Error('Ошибка '+res.status+' '+text);}setStatus(form,'ok','Заявка отправлена. Мы свяжемся с вами для уточнения деталей.');form.reset();}
    catch(err){console.error(err);setStatus(form,'err','Не удалось отправить заявку. Позвоните нам или попробуйте ещё раз.');}
    finally{btn.disabled=false;btn.textContent='Отправить заявку';}
  }
  function init(){injectServiceLinks();document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
