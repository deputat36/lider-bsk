// Shows the public request reference after the shared lead form reports success.
(function(){
  'use strict';

  window.addEventListener('leader:goal',function(event){
    const detail=event&&event.detail||{};
    const params=detail.params||{};
    const requestId=String(params.request_id||'').trim();
    if(detail.goal!=='lead_sent'||!requestId)return;

    const forms=Array.from(document.querySelectorAll('[data-leader-lead-widget]'));
    const form=forms.find(item=>item.dataset.submitting==='1')||forms[0];
    if(!form)return;

    form.dataset.lastRequestId=requestId;
    const status=form.querySelector('[data-leader-lead-status]');
    if(!status)return;

    status.className='leader-lead-status show ok';
    status.textContent='Заявка отправлена. Номер обращения: '+requestId+'. Мы свяжемся с вами для уточнения деталей.';
  });
})();
