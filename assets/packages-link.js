(function(){
  const links={
    core:[
      ['Услуги','/#services'],
      ['Примеры работ','primery-rabot-kejsy.html'],
      ['Реклама в группах ВК','reklama-v-soobshchestvah-borisoglebska.html'],
      ['Срочная реклама','srochnaya-reklama-borisoglebsk.html'],
      ['Цены','prices.html'],
      ['Комплекты рекламы','komplekty-reklamy.html'],
      ['Реклама для бизнеса','reklama-dlya-biznesa.html'],
      ['Реклама в соцсетях Борисоглебска','reklama-v-socsetyah-borisoglebsk.html'],
      ['Реклама мероприятий','reklama-dlya-meropriyatiy-borisoglebsk.html'],
      ['Реклама для кафе','reklama-dlya-kafe-borisoglebsk.html'],
      ['Реклама для салона','reklama-dlya-salona-krasoty-borisoglebsk.html'],
      ['Реклама для сервиса','reklama-dlya-servisa-masterskoy-borisoglebsk.html'],
      ['Что нужно для расчёта','chto-nuzhno-dlya-rascheta.html'],
      ['Как проходит заказ','kak-prohodit-zakaz.html'],
      ['Примеры задач','portfolio.html'],
      ['FAQ','faq.html']
    ],
    landing:[
      ['Срочная реклама','srochnaya-reklama-borisoglebsk.html'],
      ['Реклама для магазина','reklama-dlya-magazina-borisoglebsk.html'],
      ['Реклама для кафе и доставки','reklama-dlya-kafe-borisoglebsk.html'],
      ['Реклама для салона и мастера','reklama-dlya-salona-krasoty-borisoglebsk.html'],
      ['Реклама для сервиса и мастерской','reklama-dlya-servisa-masterskoy-borisoglebsk.html'],
      ['Реклама мероприятий','reklama-dlya-meropriyatiy-borisoglebsk.html'],
      ['Реклама в соцсетях','reklama-v-socsetyah-borisoglebsk.html'],
      ['Реклама в группах ВК и ОК','reklama-v-soobshchestvah-borisoglebska.html'],
      ['Комплекты рекламы','komplekty-reklamy.html'],
      ['Примеры работ и кейсы','primery-rabot-kejsy.html'],
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

  function isHome(){return location.pathname==='/' || location.pathname.endsWith('/index.html');}
  function makeCard(id,icon,title,text,href){return '<article class="card" id="'+id+'"><div class="icon">'+icon+'</div><h3>'+title+'</h3><p>'+text+'</p><a href="'+href+'">Подробнее →</a></article>';}

  function addHeaderLayoutFix(){
    if(document.getElementById('leader-header-layout-fix-v7'))return;
    const style=document.createElement('style');
    style.id='leader-header-layout-fix-v7';
    style.textContent='@media(min-width:1025px){.header .header__in{display:grid!important;grid-template-columns:minmax(220px,auto) minmax(0,1fr) auto!important;align-items:center!important;gap:8px 14px!important;min-height:auto!important;padding:10px 0!important}.header .brand{min-width:0!important;max-width:330px!important;flex:0 1 auto!important}.header .nav{display:flex!important;min-width:0!important;max-width:100%!important;flex-wrap:wrap!important;justify-content:center!important;align-items:center!important;gap:7px 14px!important;font-size:clamp(12px,.86vw,15px)!important;line-height:1.15!important;overflow:hidden!important}.header .nav a{white-space:nowrap!important;flex:0 0 auto!important}.header .header__cta{min-width:0!important;display:flex!important;justify-content:flex-end!important;gap:8px!important;margin-left:0!important}.header .phone{font-size:clamp(12px,.86vw,16px)!important;white-space:nowrap!important}.header .btn{min-height:42px!important;padding:10px 16px!important;white-space:nowrap!important;font-size:clamp(13px,.9vw,15px)!important}}@media(min-width:1025px) and (max-width:1900px){.header .header__in{grid-template-columns:minmax(190px,auto) auto!important}.header .nav{grid-column:1/-1!important;order:3!important;width:100%!important;padding-top:2px!important}.header .header__cta{justify-self:end!important}}';
    document.head.appendChild(style);
  }

  function ensureServicePagesBlock(){
    if(!isHome())return;
    if(document.getElementById('service-pages'))return;
    const services=document.getElementById('services');
    if(!services)return;
    const section=document.createElement('section');
    section.id='service-pages';
    section.className='soft';
    section.innerHTML='<div class="container"><div class="section-head"><h2>Популярные услуги отдельно</h2><p>Выберите конкретное направление, чтобы быстрее понять варианты, цены, примеры и оставить заявку на нужную услугу.</p></div><div class="grid3"></div></div>';
    services.insertAdjacentElement('afterend',section);
  }

  function addUtilityCards(){
    ensureServicePagesBlock();
    const grid=document.querySelector('#service-pages .grid3');
    if(!grid)return;
    const cards=[
      ['communities-ads-card','📣','Реклама в группах ВК и ОК','Размещение рекламных постов, репостов, закрепов и пакетов публикаций в сообществах Борисоглебска.','reklama-v-soobshchestvah-borisoglebska.html'],
      ['cases-card','📸','Примеры работ и кейсы','Карточки под реальные фото: баннеры, наклейки, таблички, витрины, макеты, посты и комплексные решения.','primery-rabot-kejsy.html'],
      ['urgent-ads-card','⚡','Срочная реклама','Баннер, макет, афиша, пост или размещение в соцсетях, когда открытие или мероприятие уже скоро.','srochnaya-reklama-borisoglebsk.html'],
      ['social-ads-card','📢','Реклама в соцсетях Борисоглебска','Размещение в городских сообществах, рекламные посты, анонсы мероприятий, тексты и изображения.','reklama-v-socsetyah-borisoglebsk.html'],
      ['cafe-ads-card','☕','Реклама для кафе и доставки','Меню, посты, баннеры, наклейки, акции, доставка, карты и оформление общепита.','reklama-dlya-kafe-borisoglebsk.html'],
      ['beauty-ads-card','💇','Реклама для салона и мастера','ВК, посты, прайсы, сертификаты, таблички, наклейки, карты и стиль для салонов и частных мастеров.','reklama-dlya-salona-krasoty-borisoglebsk.html'],
      ['service-ads-card','🛠️','Реклама для сервиса и мастерской','Вывески, баннеры, таблички, прайсы, наклейки, соцсети и карты для ремонта, сервиса и мастерских.','reklama-dlya-servisa-masterskoy-borisoglebsk.html'],
      ['events-ads-card','🎪','Реклама мероприятий','Для цирков, выставок, ярмарок, фестивалей, концертов и переездного бизнеса в Борисоглебске.','reklama-dlya-meropriyatiy-borisoglebsk.html'],
      ['store-ads-card','🏪','Реклама для магазина','Вывеска, баннер, витрина, таблички, карты, соцсети и комплект для новой торговой точки.','reklama-dlya-magazina-borisoglebsk.html'],
      ['packages-link-card','📦','Комплекты рекламы','Готовые наборы для магазина, кафе, салона, сервиса, пункта выдачи, офиса и онлайн-продвижения.','komplekty-reklamy.html'],
      ['business-ads-card','🧩','Реклама для бизнеса','Подбор рекламы по ситуации: магазин, кафе, салон, сервис, пункт выдачи, стройка или частный мастер.','reklama-dlya-biznesa.html'],
      ['calc-checklist-card','✅','Что нужно для расчёта','Чек-лист по баннерам, наклейкам, табличкам, вывескам, витринам, дизайну, соцсетям и картам.','chto-nuzhno-dlya-rascheta.html'],
      ['prices-card','💰','Цены и ориентиры','Понятно объясняем, от чего зависит стоимость баннеров, наклеек, табличек, дизайна и онлайн-услуг.','prices.html']
    ];
    cards.forEach(function(c){if(!document.getElementById(c[0]))grid.insertAdjacentHTML('beforeend',makeCard(c[0],c[1],c[2],c[3],c[4]));});
  }

  function addHeroChecklistLink(){
    const quick=document.querySelector('.hero-card .quick');
    if(!quick)return;
    const oldIds=['hero-communities-link','hero-cases-link','hero-urgent-ads-link','hero-social-ads-link','hero-cafe-ads-link','hero-beauty-ads-link','hero-service-ads-link','hero-events-ads-link','hero-packages-link','hero-checklist-link'];
    oldIds.forEach(function(id){const el=document.getElementById(id);if(el)el.remove();});
    const items=[
      ['hero-urgent-ads-link','srochnaya-reklama-borisoglebsk.html','Срочно нужна реклама'],
      ['hero-packages-link','komplekty-reklamy.html','Комплекты рекламы'],
      ['hero-cases-link','primery-rabot-kejsy.html','Примеры работ'],
      ['hero-checklist-link','chto-nuzhno-dlya-rascheta.html','Что подготовить для расчёта']
    ];
    items.forEach(function(i){if(document.getElementById(i[0]))return;const a=document.createElement('a');a.id=i[0];a.href=i[1];a.innerHTML=i[2]+' <span>→</span>';quick.appendChild(a);});
  }

  function addFaqChecklistLink(){
    const faq=document.querySelector('.faq > div:last-child');
    if(!faq||document.getElementById('faq-checklist-link'))return;
    const box=document.createElement('div');
    box.id='faq-checklist-link';
    box.className='notice';
    box.style.marginTop='12px';
    box.innerHTML='Не знаете, что указать в заявке? Посмотрите <a href="primery-rabot-kejsy.html" style="font-weight:900;text-decoration:underline">примеры работ</a>, откройте <a href="reklama-v-soobshchestvah-borisoglebska.html" style="font-weight:900;text-decoration:underline">рекламу в группах ВК и ОК</a>, <a href="srochnaya-reklama-borisoglebsk.html" style="font-weight:900;text-decoration:underline">срочную рекламу</a> или <a href="chto-nuzhno-dlya-rascheta.html" style="font-weight:900;text-decoration:underline">чек-лист для расчёта</a>.';
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
    if(!nav)return;
    ['nav-communities-link','nav-cafe-link','nav-beauty-link','nav-service-link','nav-social-link','nav-packages-link'].forEach(function(id){const el=document.getElementById(id);if(el)el.remove();});
    if(document.getElementById('nav-cases-link'))return;
    const navItems=[
      ['nav-cases-link','primery-rabot-kejsy.html','Кейсы'],
      ['nav-urgent-link','srochnaya-reklama-borisoglebsk.html','Срочно'],
      ['nav-prices-link','prices.html','Цены']
    ];
    const before=nav.querySelector('a[href="#request"]')||null;
    navItems.forEach(function(i){if(document.getElementById(i[0]))return;const a=document.createElement('a');a.id=i[0];a.href=i[1];a.textContent=i[2];nav.insertBefore(a,before);});
  }

  function addChecklistToContacts(){
    const contactCard=document.querySelector('#contacts .contacts .card:last-child');
    if(!contactCard)return;
    ['contacts-communities-link','contacts-cases-link','contacts-urgent-link','contacts-checklist-link','contacts-social-link','contacts-cafe-link','contacts-beauty-link','contacts-service-link'].forEach(function(id){const el=document.getElementById(id);if(el)el.remove();});
    const items=[
      ['contacts-cases-link','primery-rabot-kejsy.html','Примеры работ'],
      ['contacts-urgent-link','srochnaya-reklama-borisoglebsk.html','Срочная реклама'],
      ['contacts-checklist-link','chto-nuzhno-dlya-rascheta.html','Что нужно для расчёта'],
      ['contacts-cafe-link','reklama-dlya-kafe-borisoglebsk.html','Реклама для кафе']
    ];
    const mainBtn=contactCard.querySelector('a.btn');
    if(!mainBtn)return;
    let after=mainBtn;
    items.forEach(function(i){const a=document.createElement('a');a.id=i[0];a.className='btn btn--white';a.href=i[1];a.style.marginLeft='8px';a.style.marginTop='8px';a.textContent=i[2];after.insertAdjacentElement('afterend',a);after=a;});
  }

  function run(){addHeaderLayoutFix();addUtilityCards();addHeroChecklistLink();addFaqChecklistLink();addFooterNavigation();addTopNavUsefulLinks();addChecklistToContacts();}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(run,120);setTimeout(run,600);setTimeout(run,1200);});
})();
