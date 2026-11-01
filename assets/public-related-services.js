// RA Lider related services helper for public landing pages.
(function(){
  'use strict';
  var links={
    design:['dizayn-maketov.html','Дизайн макета'],
    prepress:['podgotovka-maketov-k-pechati.html','Проверка и подготовка к печати'],
    print:['poligrafiya-borisoglebsk.html','Полиграфия'],
    cards:['vizitki-borisoglebsk.html','Визитки'],
    handouts:['razdatochnye-materialy-borisoglebsk.html','Листовки и раздаточные материалы'],
    booklets:['buklety-borisoglebsk.html','Буклеты'],
    tags:['birki-etiketki-borisoglebsk.html','Бирки и этикетки'],
    stickers:['nakleyki-plotternaya-rezka-borisoglebsk.html','Наклейки'],
    folders:['papki-konverty-borisoglebsk.html','Папки и конверты'],
    forms:['blanki-borisoglebsk.html','Фирменные бланки'],
    qr:['qr-katalogi-onlayn-zapis.html','QR-меню и электронный каталог'],
    events:['reklama-dlya-meropriyatiy-borisoglebsk.html','Оформление мероприятия'],
    souvenirs:['suvenirnaya-produkciya.html','Сувенирная продукция'],
    distribution:['promoutery-borisoglebsk.html','Распространение рекламы']
  };
  var related={
    'vizitki-borisoglebsk.html':['design','prepress','handouts','tags'],
    'poligrafiya-borisoglebsk.html':['cards','handouts','design','prepress'],
    'menyu-dlya-kafe-borisoglebsk.html':['qr','stickers','design','print'],
    'birki-etiketki-borisoglebsk.html':['stickers','prepress','cards','print'],
    'blanki-borisoglebsk.html':['folders','cards','design','print'],
    'papki-konverty-borisoglebsk.html':['forms','cards','design','prepress'],
    'buklety-borisoglebsk.html':['handouts','design','prepress','cards'],
    'razdatochnye-materialy-borisoglebsk.html':['cards','booklets','distribution','design'],
    'gramoty-borisoglebsk.html':['design','prepress','print','events'],
    'kalendari-borisoglebsk.html':['design','prepress','print','souvenirs'],
    'otkrytki-priglasheniya-borisoglebsk.html':['design','prepress','events','print']
  };
  function pageKey(){return (location.pathname.split('/').pop()||'index.html').toLowerCase()}
  function skip(){var k=pageKey();return k==='index.html'||k==='privacy.html'||location.pathname==='/'||document.getElementById('leader-related-services')}
  function add(){
    if(skip()||!related[pageKey()])return;
    var anchor=document.getElementById('request')||document.querySelector('[data-leader-lead-form]');
    if(!anchor||!anchor.parentNode)return;
    var style=document.createElement('style');
    style.id='leader-related-services-style';
    style.textContent='.leader-related-services{padding:46px 0;background:#f8fafc}.leader-related-services__wrap{width:min(100% - 32px,1120px);margin:0 auto}.leader-related-services h2{margin:0 0 10px;font-size:clamp(26px,4vw,40px);line-height:1.08}.leader-related-services p{margin:0 0 18px;color:#667085}.leader-related-services__grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.leader-related-services a{display:flex;align-items:center;min-height:48px;border:1px solid #e5e7eb;border-radius:999px;padding:10px 14px;background:#fff;color:#111827;text-decoration:none;font-weight:900}@media(max-width:900px){.leader-related-services__grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.leader-related-services__grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    var section=document.createElement('section');
    section.id='leader-related-services';
    section.className='leader-related-services';
    section.innerHTML='<div class="leader-related-services__wrap"><h2>Дополнить заказ</h2><p>Подходящие работы и материалы для этой задачи.</p><div class="leader-related-services__grid"></div></div>';
    var grid=section.querySelector('.leader-related-services__grid');
    related[pageKey()].forEach(function(key){
      var item=links[key];
      if(!item||item[0]===pageKey())return;
      var link=document.createElement('a');link.href=item[0];link.textContent=item[1];grid.appendChild(link);
    });
    anchor.parentNode.insertBefore(section,anchor);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
})();
