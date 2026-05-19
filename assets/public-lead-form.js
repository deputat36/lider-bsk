// Public lead form for RA Lider website. Sends requests to Supabase Edge Function leader-public-lead.
(function(){
  const ENDPOINT='https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead';

  function qs(){
    const p=new URLSearchParams(location.search);
    return {
      utm_source:p.get('utm_source')||'',
      utm_medium:p.get('utm_medium')||'',
      utm_campaign:p.get('utm_campaign')||'',
      utm_term:p.get('utm_term')||'',
      utm_content:p.get('utm_content')||''
    };
  }

  function sourceGuess(){
    const u=qs();
    if(u.utm_source) return u.utm_source;
    if(document.referrer){
      try { return new URL(document.referrer).hostname; } catch(e){}
    }
    return 'Сайт';
  }

  function mount(target){
    target.innerHTML=`
      <form class="leader-lead-widget" id="leaderLeadForm">
        <h3>Рассчитать стоимость</h3>
        <p>Опишите задачу — уточним детали и подготовим предварительный расчёт.</p>
        <input class="leader-lead-hp" id="llWebsite" name="website" tabindex="-1" autocomplete="off">
        <div class="leader-lead-grid">
          <div class="leader-lead-span-6">
            <label for="llName">Имя / организация</label>
            <input id="llName" maxlength="200" placeholder="Например, Алексей / ООО Ромашка">
          </div>
          <div class="leader-lead-span-6">
            <label for="llPhone">Телефон</label>
            <input id="llPhone" maxlength="80" placeholder="+7..." required>
          </div>
          <div class="leader-lead-span-6">
            <label for="llService">Услуга</label>
            <select id="llService">
              <option>Баннер</option>
              <option>Наклейки</option>
              <option>Табличка</option>
              <option>Печать на плёнке</option>
              <option>Перфорированная плёнка</option>
              <option>Плоттерная резка</option>
              <option>Дизайн</option>
              <option>Монтаж</option>
              <option>Соцсети и контент</option>
              <option>Яндекс Карты и 2ГИС</option>
              <option>Комплексная реклама</option>
              <option>Другое</option>
            </select>
          </div>
          <div class="leader-lead-span-3">
            <label for="llWidth">Ширина, м</label>
            <input id="llWidth" inputmode="decimal" placeholder="3">
          </div>
          <div class="leader-lead-span-3">
            <label for="llHeight">Высота, м</label>
            <input id="llHeight" inputmode="decimal" placeholder="1">
          </div>
          <div class="leader-lead-span-12">
            <label for="llMessage">Что нужно сделать?</label>
            <textarea id="llMessage" maxlength="2000" rows="4" placeholder="Размеры, материал, количество, сроки, нужен ли макет или монтаж..."></textarea>
          </div>
          <div class="leader-lead-span-12">
            <button id="llSubmit" type="submit">Отправить заявку</button>
          </div>
        </div>
        <div class="leader-lead-note">Нажимая кнопку, вы соглашаетесь на обработку данных для связи и расчёта заказа.</div>
        <div id="llStatus" class="leader-lead-status"></div>
      </form>`;
    target.querySelector('form').addEventListener('submit', submit);
  }

  function status(type,msg){
    const s=document.getElementById('llStatus');
    if(!s) return;
    s.className='leader-lead-status show '+type;
    s.textContent=msg;
  }

  async function submit(e){
    e.preventDefault();
    const btn=document.getElementById('llSubmit');
    const hp=document.getElementById('llWebsite');
    if(hp && hp.value) return;

    const name=document.getElementById('llName').value.trim();
    const phone=document.getElementById('llPhone').value.trim();
    const service=document.getElementById('llService').value;
    const width=document.getElementById('llWidth').value.trim();
    const height=document.getElementById('llHeight').value.trim();
    const message=document.getElementById('llMessage').value.trim();

    if(!phone && !message){
      status('err','Укажите телефон или опишите задачу.');
      return;
    }

    btn.disabled=true;
    btn.textContent='Отправляем...';

    const utm=qs();
    const payload={
      name,
      phone,
      service,
      source:sourceGuess(),
      message:[message,width||height?('Размеры: '+(width||'-')+'×'+(height||'-')+' м'):''].filter(Boolean).join('\n'),
      page_url:location.href,
      width,
      height,
      ...utm,
      website:hp ? hp.value : ''
    };

    try{
      const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(!res.ok) throw new Error('Ошибка '+res.status);
      status('ok','Заявка отправлена. Мы свяжемся с вами для уточнения деталей.');
      e.target.reset();
    }catch(err){
      console.error(err);
      status('err','Не удалось отправить заявку. Позвоните нам или попробуйте ещё раз.');
    }finally{
      btn.disabled=false;
      btn.textContent='Отправить заявку';
    }
  }

  function init(){
    document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
