(function(){
  function addUtilityCards(){
    const grid=document.querySelector('#service-pages .grid3');
    if(grid){
      if(!document.getElementById('packages-link-card')){
        const card=document.createElement('article');
        card.className='card';
        card.id='packages-link-card';
        card.innerHTML='<div class="icon">📦</div><h3>Комплекты рекламы</h3><p>Готовые наборы для магазина, кафе, салона, сервиса, пункта выдачи, офиса и онлайн-продвижения.</p><a href="komplekty-reklamy.html">Подробнее →</a>';
        grid.insertBefore(card,grid.children[1]||null);
      }
      if(!document.getElementById('calc-checklist-card')){
        const checklist=document.createElement('article');
        checklist.className='card';
        checklist.id='calc-checklist-card';
        checklist.innerHTML='<div class="icon">✅</div><h3>Что нужно для расчёта</h3><p>Чек-лист по баннерам, наклейкам, табличкам, вывескам, витринам, дизайну, соцсетям и картам.</p><a href="chto-nuzhno-dlya-rascheta.html">Открыть чек-лист →</a>';
        grid.insertBefore(checklist,grid.children[2]||null);
      }
    }
  }
  function addHeroChecklistLink(){
    const quick=document.querySelector('.hero-card .quick');
    if(!quick||document.getElementById('hero-checklist-link'))return;
    const a=document.createElement('a');
    a.id='hero-checklist-link';
    a.href='chto-nuzhno-dlya-rascheta.html';
    a.innerHTML='Что подготовить для расчёта <span>→</span>';
    quick.appendChild(a);
  }
  function addFaqChecklistLink(){
    const faq=document.querySelector('.faq > div:last-child');
    if(!faq||document.getElementById('faq-checklist-link'))return;
    const box=document.createElement('div');
    box.id='faq-checklist-link';
    box.className='notice';
    box.style.marginTop='12px';
    box.innerHTML='Не знаете, что указать в заявке? Откройте <a href="chto-nuzhno-dlya-rascheta.html" style="font-weight:900;text-decoration:underline">чек-лист для расчёта</a>.';
    faq.appendChild(box);
  }
  function addFooterChecklistLink(){
    const footerLinks=document.querySelector('.footer .mini');
    if(!footerLinks||document.getElementById('footer-checklist-link'))return;
    const link=document.createElement('div');
    link.id='footer-checklist-link';
    link.className='mini';
    link.innerHTML='<a href="chto-nuzhno-dlya-rascheta.html">Что нужно для расчёта</a>';
    footerLinks.parentElement.appendChild(link);
  }
  function run(){addUtilityCards();addHeroChecklistLink();addFaqChecklistLink();addFooterChecklistLink();}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(run,300);setTimeout(run,1000);setTimeout(run,1800);});
})();
