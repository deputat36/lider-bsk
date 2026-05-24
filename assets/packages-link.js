(function(){
  function addPackagesCard(){
    if(document.getElementById('packages-link-card'))return;
    const grid=document.querySelector('#service-pages .grid3');
    if(!grid)return;
    const card=document.createElement('article');
    card.className='card';
    card.id='packages-link-card';
    card.innerHTML='<div class="icon">📦</div><h3>Комплекты рекламы</h3><p>Готовые наборы для магазина, кафе, салона, сервиса, пункта выдачи, офиса и онлайн-продвижения.</p><a href="komplekty-reklamy.html">Подробнее →</a>';
    grid.insertBefore(card,grid.children[1]||null);
  }
  document.addEventListener('DOMContentLoaded',function(){setTimeout(addPackagesCard,400);setTimeout(addPackagesCard,1200);});
})();
