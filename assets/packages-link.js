(function(){
  const links={
    core:[
      ['Услуги','/#services'],
      ['Цены','prices.html'],
      ['Комплекты рекламы','komplekty-reklamy.html'],
      ['Реклама для бизнеса','reklama-dlya-biznesa.html'],
      ['Реклама в соцсетях Борисоглебска','reklama-v-socsetyah-borisoglebsk.html'],
      ['Реклама мероприятий','reklama-dlya-meropriyatiy-borisoglebsk.html'],
      ['Реклама для кафе','reklama-dlya-kafe-borisoglebsk.html'],
      ['Что нужно для расчёта','chto-nuzhno-dlya-rascheta.html'],
      ['Как проходит заказ','kak-prohodit-zakaz.html'],
      ['Примеры задач','portfolio.html'],
      ['FAQ','faq.html']
    ],
    landing:[
      ['Реклама для магазина','reklama-dlya-magazina-borisoglebsk.html'],
      ['Реклама для кафе и доставки','reklama-dlya-kafe-borisoglebsk.html'],
      ['Реклама мероприятий','reklama-dlya-meropriyatiy-borisoglebsk.html'],
      ['Реклама в соцсетях','reklama-v-socsetyah-borisoglebsk.html'],
      ['Комплекты рекламы','komplekty-reklamy.html'],
      ['Реклама для бизнеса','reklama-dlya-biznesa.html']
    ],
    services:[
      ['Наружная реклама','outdoor-advertising-borisoglebsk.html'],
      ['Баннеры','bannery-borisoglebsk.html'],
      ['Вывески','vyveski-borisoglebsk.html'],
      ['Печать на плёнке','pechat-na-plenke-borisoglebsk.html'],
      ['Оформление витрин','oformlenie-vitrin-borisoglebsk.html'],
      ['Наклейки и плоттерная резка','nakleyki-plotternaya-rezka-borisoglebsk.html'],
      ['Таблички','tablichki-borisoglebsk.html'],
      ['Дизайн макетов','dizayn-maketov.html'],
      ['Логотип и фирменный стиль','logotip-firmennyy-stil.html'],
      ['Соцсети и контент','socseti-kontent.html'],
      ['Яндекс Карты и 2ГИС','yandex-karty-2gis.html']
    ]
  };
  function addUtilityCards(){
    const grid=document.querySelector('#service-pages .grid3');
    if(grid){
      if(!document.getElementById('social-ads-card')){
        const social=document.createElement('article');
        social.className='card';
        social.id='social-ads-card';
        social.innerHTML='<div class="icon">📢</div><h3>Реклама в соцсетях Борисоглебска</h3><p>Размещение в городских сообществах, рекламные посты, анонсы мероприятий, тексты и изображения.</p><a href="reklama-v-socsetyah-borisoglebsk.html">Подробнее →</a>';
        grid.insertBefore(social,grid.children[1]||null);
      }
      if(!document.getElementById('cafe-ads-card')){
        const cafe=document.createElement('article');
        cafe.className='card';
        cafe.id='cafe-ads-card';
        cafe.innerHTML='<div class="icon">☕</div><h3>Реклама для кафе и доставки</h3><p>Меню, посты, баннеры, наклейки, акции, доставка, карты и оформление общепита.</p><a href="reklama-dlya-kafe-borisoglebsk.html">Подробнее →</a>';
        grid.insertBefore(cafe,grid.children[2]||null);
      }
      if(!document.getElementById('events-ads-card')){
        const events=document.createElement('article');
        events.className='card';
        events.id='events-ads-card';
        events.innerHTML='<div class="icon">🎪</div><h3>Реклама мероприятий</h3><p>Для цирков, выставок, ярмарок, фестивалей, концертов и переездного бизнеса в Борисоглебске.</p><a href="reklama-dlya-meropriyatiy-borisoglebsk.html">Подробнее →</a>';
        grid.insertBefore(events,grid.children[3]||null);
      }
      if(!document.getElementById('store-ads-card')){
        const store=document.createElement('article');
        store.className='card';
        store.id='store-ads-card';
        store.innerHTML='<div class="icon">🏪</div><h3>Реклама для магазина</h3><p>Вывеска, баннер, витрина, таблички, карты, соцсети и комплект для новой торговой точки.</p><a href="reklama-dlya-magazina-borisoglebsk.html">Подробнее →</a>';
        grid.insertBefore(store,grid.children[4]||null);
      }
      if(!document.getElementById('packages-link-card')){
        const card=document.createElement('article');
        card.className='card';
        card.id='packages-link-card';
        card.innerHTML='<div class="icon">📦</div><h3>Комплекты рекламы</h3><p>Готовые наборы для магазина, кафе, салона, сервиса, пункта выдачи, офиса и онлайн-продвижения.</p><a href="komplekty-reklamy.html">Подробнее →</a>';
        grid.insertBefore(card,grid.children[5]||null);
      }
      if(!document.getElementById('calc-checklist-card')){
        const checklist=document.createElement('article');
        checklist.className='card';
        checklist.id='calc-checklist-card';
        checklist.innerHTML='<div class="icon">✅</div><h3>Что нужно для расчёта</h3><p>Чек-лист по баннерам, наклейкам, табличкам, вывескам, витринам, дизайну, соцсетям и картам.</p><a href="chto-nuzhno-dlya-rascheta.html">Открыть чек-лист →</a>';
        grid.insertBefore(checklist,grid.children[6]||null);
      }
    }
  }
  function addHeroChecklistLink(){
    const quick=document.querySelector('.hero-card .quick');
    if(!quick)return;
    if(!document.getElementById('hero-social-ads-link')){
      const s=document.createElement('a');
      s.id='hero-social-ads-link';
      s.href='reklama-v-socsetyah-borisoglebsk.html';
      s.innerHTML='Реклама в соцсетях Борисоглебска <span>→</span>';
      quick.appendChild(s);
    }
    if(!document.getElementById('hero-cafe-ads-link')){
      const c=document.createElement('a');
      c.id='hero-cafe-ads-link';
      c.href='reklama-dlya-kafe-borisoglebsk.html';
      c.innerHTML='Реклама для кафе и доставки <span>→</span>';
      quick.appendChild(c);
    }
    if(!document.getElementById('hero-events-ads-link')){
      const e=document.createElement('a');
      e.id='hero-events-ads-link';
      e.href='reklama-dlya-meropriyatiy-borisoglebsk.html';
      e.innerHTML='Реклама мероприятий и ярмарок <span>→</span>';
      quick.appendChild(e);
    }
    if(!document.getElementById('hero-packages-link')&&!quick.querySelector('a[href="komplekty-reklamy.html"]')){
      const p=document.createElement('a');
      p.id='hero-packages-link';
      p.href='komplekty-reklamy.html';
      p.innerHTML='Комплекты рекламы <span>→</span>';
      quick.appendChild(p);
    }
    if(!document.getElementById('hero-checklist-link')){
      const a=document.createElement('a');
      a.id='hero-checklist-link';
      a.href='chto-nuzhno-dlya-rascheta.html';
      a.innerHTML='Что подготовить для расчёта <span>→</span>';
      quick.appendChild(a);
    }
  }
  function addFaqChecklistLink(){
    const faq=document.querySelector('.faq > div:last-child');
    if(!faq||document.getElementById('faq-checklist-link'))return;
    const box=document.createElement('div');
    box.id='faq-checklist-link';
    box.className='notice';
    box.style.marginTop='12px';
    box.innerHTML='Не знаете, что указать в заявке? Откройте <a href="chto-nuzhno-dlya-rascheta.html" style="font-weight:900;text-decoration:underline">чек-лист для расчёта</a>, страницу <a href="komplekty-reklamy.html" style="font-weight:900;text-decoration:underline">комплектов рекламы</a>, <a href="reklama-dlya-kafe-borisoglebsk.html" style="font-weight:900;text-decoration:underline">рекламу для кафе</a> или <a href="reklama-v-socsetyah-borisoglebsk.html" style="font-weight:900;text-decoration:underline">рекламу в соцсетях Борисоглебска</a>.';
    faq.appendChild(box);
  }
  function addFooterNavigation(){
    const footer=document.querySelector('.footer');
    if(!footer||document.getElementById('footer-nav-seo'))return;
    const style=document.createElement('style');
    style.id='footer-nav-seo-style';
    style.textContent='.footer-nav-seo{margin-top:28px;display:grid;grid-template-columns:1fr 1fr 1.35fr 1fr;gap:22px;border-top:1px solid rgba(255,255,255,.12);padding-top:24px}.footer-nav-seo h3{color:#fff;margin:0 0 10px;font-size:16px}.footer-nav-seo a{display:inline-block;margin:0 10px 8px 0;color:#fff;font-weight:800;text-decoration:none}.footer-nav-seo p{margin:0 0 8px;color:rgba(255,255,255,.68)}@media(max-width:900px){.footer-nav-seo{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    const block=document.createElement('div');
    block.id='footer-nav-seo';
    block.className='container footer-nav-seo';
    block.innerHTML='<div><h3>Навигация</h3>'+links.core.map(l=>'<a href="'+l[1]+'">'+l[0]+'</a>').join('')+'</div><div><h3>Для кого</h3>'+links.landing.map(l=>'<a href="'+l[1]+'">'+l[0]+'</a>').join('')+'</div><div><h3>Услуги</h3>'+links.services.map(l=>'<a href="'+l[1]+'">'+l[0]+'</a>').join('')+'</div><div><h3>Связаться</h3><p>РА «Лидер», Борисоглебск</p><p><a href="tel:+79802457471">8 980 245-74-71</a></p><p><a href="/#request">Оставить заявку</a></p></div>';
    footer.appendChild(block);
  }
  function addTopNavUsefulLinks(){
    const nav=document.querySelector('.nav');
    if(!nav||document.getElementById('nav-prices-link'))return;
    const prices=document.createElement('a');
    prices.id='nav-prices-link';
    prices.href='prices.html';
    prices.textContent='Цены';
    const packs=document.createElement('a');
    packs.id='nav-packages-link';
    packs.href='komplekty-reklamy.html';
    packs.textContent='Комплекты';
    const cafe=document.createElement('a');
    cafe.id='nav-cafe-link';
    cafe.href='reklama-dlya-kafe-borisoglebsk.html';
    cafe.textContent='Кафе';
    const social=document.createElement('a');
    social.id='nav-social-link';
    social.href='reklama-v-socsetyah-borisoglebsk.html';
    social.textContent='Соцсети';
    nav.insertBefore(cafe,nav.querySelector('a[href="#request"]')||null);
    nav.insertBefore(social,nav.querySelector('a[href="#request"]')||null);
    nav.insertBefore(prices,nav.querySelector('a[href="#request"]')||null);
    nav.insertBefore(packs,nav.querySelector('a[href="#request"]')||null);
  }
  function addChecklistToContacts(){
    const contactCard=document.querySelector('#contacts .contacts .card:last-child');
    if(!contactCard||document.getElementById('contacts-checklist-link'))return;
    const a=document.createElement('a');
    a.id='contacts-checklist-link';
    a.className='btn btn--white';
    a.href='chto-nuzhno-dlya-rascheta.html';
    a.style.marginLeft='8px';
    a.textContent='Что нужно для расчёта';
    const b=document.createElement('a');
    b.id='contacts-social-link';
    b.className='btn btn--white';
    b.href='reklama-v-socsetyah-borisoglebsk.html';
    b.style.marginLeft='8px';
    b.textContent='Реклама в соцсетях';
    const c=document.createElement('a');
    c.id='contacts-cafe-link';
    c.className='btn btn--white';
    c.href='reklama-dlya-kafe-borisoglebsk.html';
    c.style.marginLeft='8px';
    c.textContent='Реклама для кафе';
    const mainBtn=contactCard.querySelector('a.btn');
    if(mainBtn){mainBtn.insertAdjacentElement('afterend',a);a.insertAdjacentElement('afterend',b);b.insertAdjacentElement('afterend',c)}
  }
  function run(){
    addUtilityCards();
    addHeroChecklistLink();
    addFaqChecklistLink();
    addFooterNavigation();
    addTopNavUsefulLinks();
    addChecklistToContacts();
  }
  document.addEventListener('DOMContentLoaded',function(){setTimeout(run,300);setTimeout(run,1000);setTimeout(run,1800);});
})();
