// RA Lider related services helper for public landing pages.
(function(){
  'use strict';
  function pageKey(){return (location.pathname.split('/').pop()||'index.html').toLowerCase()}
  function skip(){var k=pageKey();return k==='index.html'||k==='privacy.html'||location.pathname==='/'||document.getElementById('leader-related-services')}
  function selectDefaultService(){
    if(pageKey()!=='uslugi.html')return;
    window.setTimeout(function(){
      var form=document.querySelector('[data-leader-lead-widget]');
      if(!form)return;
      var service=form.querySelector('[name="service"]');
      if(service&&service.options.length>10)service.selectedIndex=10;
    },80);
  }
  function add(){
    selectDefaultService();
    if(skip())return;
    var anchor=document.getElementById('request')||document.querySelector('[data-leader-lead-form]');
    if(!anchor||!anchor.parentNode)return;
    var style=document.createElement('style');
    style.id='leader-related-services-style';
    style.textContent='.leader-related-services{padding:46px 0;background:#f8fafc}.leader-related-services__wrap{width:min(100% - 32px,1120px);margin:0 auto}.leader-related-services h2{margin:0 0 10px;font-size:clamp(26px,4vw,40px);line-height:1.08}.leader-related-services p{margin:0 0 18px;color:#667085}.leader-related-services__grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.leader-related-services a{display:flex;align-items:center;min-height:48px;border:1px solid #e5e7eb;border-radius:999px;padding:10px 14px;background:#fff;color:#111827;text-decoration:none;font-weight:900}@media(max-width:900px){.leader-related-services__grid{grid-template-columns:1fr 1fr}}@media(max-width:560px){.leader-related-services__grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    var section=document.createElement('section');
    section.id='leader-related-services';
    section.className='leader-related-services';
    section.innerHTML='<div class="leader-related-services__wrap"><h2>Смежные услуги</h2><p>Посмотрите соседние направления, если задача шире одной позиции.</p><div class="leader-related-services__grid"><a href="poligrafiya-borisoglebsk.html">Полиграфия</a><a href="vizitki-borisoglebsk.html">Визитки</a><a href="razdatochnye-materialy-borisoglebsk.html">Раздаточные материалы</a><a href="pechat-bannerov-borisoglebsk.html">Печать баннеров</a><a href="banner-dlya-magazina-borisoglebsk.html">Баннер для магазина</a><a href="oformlenie-vhoda-borisoglebsk.html">Оформление входа</a><a href="rezhim-raboty-tablichki-borisoglebsk.html">Режим работы</a><a href="nakleyki-na-vitrinu-borisoglebsk.html">Наклейки на витрину</a><a href="reklamnye-posty-vk-borisoglebsk.html">Посты ВК</a><a href="audit-kart-yandex-2gis-borisoglebsk.html">Аудит карт</a><a href="komplekty-reklamy.html">Комплекты рекламы</a></div></div>';
    anchor.parentNode.insertBefore(section,anchor);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
})();
