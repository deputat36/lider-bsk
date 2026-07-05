(function(){
  function isHome(){return location.pathname==='/'||location.pathname.endsWith('/index.html')}
  function styleFix(){
    if(document.getElementById('leader-ui-fix-v8'))return;
    var s=document.createElement('style');
    s.id='leader-ui-fix-v8';
    s.textContent='@media(min-width:1025px){.header .header__in{display:grid!important;grid-template-columns:minmax(210px,auto) minmax(0,1fr) auto!important;gap:8px 14px!important;align-items:center!important;min-height:auto!important;padding:10px 0!important}.header .brand{min-width:0!important;max-width:330px!important}.header .nav{display:flex!important;flex-wrap:wrap!important;justify-content:center!important;gap:7px 14px!important;font-size:clamp(12px,.86vw,15px)!important;line-height:1.15!important;overflow:hidden!important}.header .nav a{white-space:nowrap!important}.header .header__cta{display:flex!important;justify-content:flex-end!important;gap:8px!important;margin-left:0!important}.header .phone,.header .btn{white-space:nowrap!important}.header .btn{min-height:42px!important;padding:10px 16px!important}}@media(min-width:1025px) and (max-width:1900px){.header .header__in{grid-template-columns:minmax(190px,auto) auto!important}.header .nav{grid-column:1/-1!important;width:100%!important;padding-top:2px!important}.header .header__cta{justify-self:end!important}}.leader-extra-links{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.leader-extra-links a{display:block;background:#fff;border:1px solid #e6e8eb;border-radius:24px;padding:22px;font-weight:900;color:#1a1a1a;text-decoration:none;box-shadow:0 10px 30px rgba(26,26,26,.06)}@media(max-width:900px){.leader-extra-links{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }
  function cleanNav(){
    var nav=document.querySelector('.nav');
    if(!nav)return;
    ['nav-communities-link','nav-cafe-link','nav-beauty-link','nav-service-link','nav-social-link','nav-packages-link'].forEach(function(id){var el=document.getElementById(id);if(el)el.remove()});
    if(!document.getElementById('nav-cases-link')){
      [['nav-cases-link','primery-rabot-kejsy.html','Кейсы'],['nav-urgent-link','srochnaya-reklama-borisoglebsk.html','Срочно'],['nav-prices-link','prices.html','Цены']].forEach(function(i){var a=document.createElement('a');a.id=i[0];a.href=i[1];a.textContent=i[2];nav.appendChild(a)});
    }
  }
  function cleanHero(){
    var quick=document.querySelector('.hero-card .quick');
    if(!quick)return;
    ['hero-communities-link','hero-cases-link','hero-urgent-ads-link','hero-social-ads-link','hero-cafe-ads-link','hero-beauty-ads-link','hero-service-ads-link','hero-events-ads-link','hero-packages-link','hero-checklist-link'].forEach(function(id){var el=document.getElementById(id);if(el)el.remove()});
    quick.querySelectorAll('a').forEach(function(a){var h=a.getAttribute('href')||'';if(h==='portfolio.html'||h==='faq.html')a.remove()});
    if(!document.getElementById('hero-checklist-link')){var a=document.createElement('a');a.id='hero-checklist-link';a.href='chto-nuzhno-dlya-rascheta.html';a.innerHTML='Что подготовить для расчёта <span>→</span>';quick.appendChild(a)}
  }
  function addPopularLinks(){
    if(!isHome()||document.getElementById('service-pages'))return;
    var services=document.getElementById('services');
    if(!services)return;
    var section=document.createElement('section');
    section.id='service-pages';
    section.className='soft';
    section.innerHTML='<div class="container"><div class="section-head"><h2>Популярные услуги отдельно</h2><p>Быстрые ссылки на ключевые направления без перегруза первого экрана.</p></div><div class="leader-extra-links"><a href="primery-rabot-kejsy.html">Примеры работ и кейсы →</a><a href="srochnaya-reklama-borisoglebsk.html">Срочная реклама →</a><a href="komplekty-reklamy.html">Комплекты рекламы →</a><a href="reklama-v-soobshchestvah-borisoglebska.html">Реклама в группах ВК →</a><a href="reklama-dlya-kafe-borisoglebsk.html">Реклама для кафе →</a><a href="prices.html">Цены и ориентиры →</a></div></div>';
    services.insertAdjacentElement('afterend',section);
  }
  function cleanContacts(){
    var card=document.querySelector('#contacts .contacts .card:last-child');
    if(!card)return;
    ['contacts-communities-link','contacts-cases-link','contacts-urgent-link','contacts-checklist-link','contacts-social-link','contacts-cafe-link','contacts-beauty-link','contacts-service-link'].forEach(function(id){var el=document.getElementById(id);if(el)el.remove()});
    var btn=card.querySelector('a.btn');
    if(!btn||document.getElementById('contacts-cases-link'))return;
    [['contacts-cases-link','primery-rabot-kejsy.html','Примеры работ'],['contacts-urgent-link','srochnaya-reklama-borisoglebsk.html','Срочная реклама'],['contacts-checklist-link','chto-nuzhno-dlya-rascheta.html','Что нужно для расчёта']].forEach(function(i){var a=document.createElement('a');a.id=i[0];a.className='btn btn--white';a.href=i[1];a.style.marginLeft='8px';a.style.marginTop='8px';a.textContent=i[2];btn.insertAdjacentElement('afterend',a);btn=a});
  }
  function run(){styleFix();cleanNav();cleanHero();addPopularLinks();cleanContacts()}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(run,80);setTimeout(run,500);setTimeout(run,1200)});
})();
