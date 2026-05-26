(function(){
  function isHome(){
    return location.pathname==='/' || location.pathname.endsWith('/index.html');
  }
  function addMobileCta(){
    if(document.getElementById('leader-mobile-sticky-cta'))return;
    if(isHome() && document.querySelector('.mobile-cta'))return;

    var request=document.getElementById('request') || document.getElementById('leader-lead-form') || document.querySelector('[data-leader-lead-form]');
    var requestHref=request ? '#'+(request.id || 'request') : '/#request';

    var style=document.createElement('style');
    style.id='leader-mobile-sticky-cta-style';
    style.textContent='@media(max-width:760px){body{padding-bottom:76px}.leader-mobile-sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;gap:8px;padding:10px 12px;background:rgba(255,255,255,.96);border-top:1px solid #e5e7eb;box-shadow:0 -12px 30px rgba(15,23,42,.14);backdrop-filter:blur(12px)}.leader-mobile-sticky-cta a{flex:1;min-height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:900}.leader-mobile-sticky-cta__lead{background:#f6c343;color:#111827}.leader-mobile-sticky-cta__phone{background:#111827;color:#fff}}@media(min-width:761px){.leader-mobile-sticky-cta{display:none}}';
    document.head.appendChild(style);

    var bar=document.createElement('div');
    bar.id='leader-mobile-sticky-cta';
    bar.className='leader-mobile-sticky-cta';
    bar.innerHTML='<a class="leader-mobile-sticky-cta__lead" href="'+requestHref+'">Оставить заявку</a><a class="leader-mobile-sticky-cta__phone" href="tel:+79802457471">Позвонить</a>';
    document.body.appendChild(bar);

    bar.addEventListener('click',function(e){
      var a=e.target.closest('a');
      if(!a)return;
      try{
        if(window.leaderGoal){
          window.leaderGoal(a.href.indexOf('tel:')===0?'mobile_phone_click':'mobile_cta_click',{page:location.href});
        }
      }catch(err){}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addMobileCta);else addMobileCta();
})();
