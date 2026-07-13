// RA Lider request page: require a usable contact when email or VK is selected.
(function(){
  'use strict';

  const EMAIL_METHOD='Написать на email';
  const VK_METHOD='Написать ВКонтакте';
  const STYLE_ID='leader-request-contact-method-style';
  const STYLE_HREF='assets/public-request-contact-method-v1.css?v=1';

  function ensureStyles(){
    if(document.getElementById(STYLE_ID))return;
    const link=document.createElement('link');
    link.id=STYLE_ID;
    link.rel='stylesheet';
    link.href=STYLE_HREF;
    document.head.appendChild(link);
  }

  function init(){
    ensureStyles();
    const host=document.getElementById('leader-lead-form');
    const form=host&&host.querySelector('[data-leader-lead-widget]');
    if(!form||form.dataset.contactMethodGuard==='1')return;

    const method=form.querySelector('[name="contact_method"]');
    const detail=form.querySelector('[name="contact_detail"]');
    const details=form.querySelector('[data-leader-details]');
    const more=form.querySelector('[data-leader-more]');
    if(!method||!detail||!details||!more)return;

    form.dataset.contactMethodGuard='1';

    const label=form.querySelector('label[for="'+detail.id+'"]');
    const fieldWrap=detail.closest('.leader-lead-span-12');
    const hint=document.createElement('small');
    hint.id=detail.id+'-hint';
    hint.className='leader-contact-hint';
    detail.insertAdjacentElement('afterend',hint);
    detail.setAttribute('aria-describedby',hint.id);

    function mode(){
      const value=String(method.value||'').trim();
      if(value===EMAIL_METHOD)return 'email';
      if(value===VK_METHOD)return 'vk';
      return 'optional';
    }

    function revealDetails(){
      if(details.hasAttribute('hidden')){
        details.removeAttribute('hidden');
        more.textContent='Скрыть подробности ↑';
      }
    }

    function applyMode(){
      const current=mode();
      const required=current!=='optional';
      detail.required=required;
      detail.setAttribute('aria-required',required?'true':'false');
      if(fieldWrap)fieldWrap.classList.toggle('leader-contact-detail-required',required);

      if(current==='email'){
        revealDetails();
        if(label)label.textContent='Email для ответа';
        detail.placeholder='Например, name@example.ru';
        detail.inputMode='email';
        detail.autocomplete='email';
        hint.textContent='Укажите email, иначе мы не сможем использовать выбранный способ связи.';
      }else if(current==='vk'){
        revealDetails();
        if(label)label.textContent='Ссылка на профиль ВКонтакте';
        detail.placeholder='Например, https://vk.com/id...';
        detail.inputMode='url';
        detail.autocomplete='url';
        hint.textContent='Укажите ссылку на профиль или страницу ВКонтакте для ответа.';
      }else{
        if(label)label.textContent='Email или ссылка на профиль';
        detail.placeholder='Необязательно. Заполните для email или ВКонтакте';
        detail.inputMode='text';
        detail.autocomplete='off';
        detail.setCustomValidity('');
        hint.textContent='Поле необязательное, если достаточно телефона или MAX по указанному номеру.';
      }
    }

    function validateBeforeSubmit(event){
      applyMode();
      const current=mode();
      const value=String(detail.value||'').trim();
      if(current==='optional'||value){
        detail.setCustomValidity('');
        return;
      }

      detail.setCustomValidity(current==='email'
        ?'Укажите email для выбранного способа связи.'
        :'Укажите ссылку на профиль ВКонтакте.');
      event.preventDefault();
      event.stopImmediatePropagation();
      revealDetails();
      detail.focus();
      detail.reportValidity();
      if(typeof window.leaderGoal==='function'){
        window.leaderGoal('contact_detail_missing',{
          contact_method:method.value,
          page:location.href,
          page_path:location.pathname
        });
      }
    }

    method.addEventListener('change',applyMode);
    detail.addEventListener('input',function(){
      if(String(detail.value||'').trim())detail.setCustomValidity('');
    });
    form.addEventListener('submit',validateBeforeSubmit,true);
    applyMode();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
