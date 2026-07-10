// Keeps the public request reference stable across retries and shows it after success.
(function(){
  'use strict';

  const ENDPOINT_MARKER='/functions/v1/leader-public-lead';
  const STORAGE_KEY='leader_public_lead_pending_v1';
  const MAX_PENDING_AGE_MS=30*60*1000;
  const nativeFetch=window.fetch.bind(window);

  function clean(value){return String(value||'').trim()}
  function normalizePhone(value){return clean(value).replace(/\D+/g,'')}
  function fingerprint(payload){
    const source=[normalizePhone(payload.phone),clean(payload.service).toLowerCase(),clean(payload.page_path).toLowerCase(),clean(payload.message)].join('|');
    let hash=2166136261;
    for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return 'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0');
  }
  function readPending(){
    try{
      const value=JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)||'null');
      if(!value||!value.request_id||!value.fingerprint)return null;
      if(Date.now()-Number(value.created_at||0)>MAX_PENDING_AGE_MS){
        window.sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return value;
    }catch(_){return null}
  }
  function writePending(value){
    try{window.sessionStorage.setItem(STORAGE_KEY,JSON.stringify(value))}catch(_){}
  }
  function clearPending(){
    try{window.sessionStorage.removeItem(STORAGE_KEY)}catch(_){}
  }

  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    const method=clean(init&&init.method||'GET').toUpperCase();
    if(url.indexOf(ENDPOINT_MARKER)===-1||method!=='POST'||typeof init?.body!=='string'){
      return nativeFetch(input,init);
    }

    let payload;
    try{payload=JSON.parse(init.body)}catch(_){return nativeFetch(input,init)}
    const currentFingerprint=fingerprint(payload);
    const pending=readPending();
    if(pending&&pending.fingerprint===currentFingerprint){
      payload.request_id=pending.request_id;
    }else if(clean(payload.request_id)){
      writePending({
        request_id:clean(payload.request_id),
        fingerprint:currentFingerprint,
        created_at:Date.now()
      });
    }

    const response=await nativeFetch(input,{...init,body:JSON.stringify(payload)});
    if(response.ok){
      response.clone().json().then(function(data){
        if(data&&data.ok===true)clearPending();
      }).catch(function(){});
    }
    return response;
  };

  window.addEventListener('leader:goal',function(event){
    const detail=event&&event.detail||{};
    const params=detail.params||{};
    const requestId=clean(params.request_id);
    if(detail.goal!=='lead_sent'||!requestId)return;

    clearPending();
    const forms=Array.from(document.querySelectorAll('[data-leader-lead-widget]'));
    const form=forms.find(item=>item.dataset.submitting==='1')||forms[0];
    if(!form)return;

    form.dataset.lastRequestId=requestId;
    const status=form.querySelector('[data-leader-lead-status]');
    if(!status)return;

    const duplicate=params.duplicate===true;
    status.className='leader-lead-status show ok';
    status.textContent=(duplicate?'Заявка уже была отправлена ранее. ':'Заявка отправлена. ')+'Номер обращения: '+requestId+'. Мы свяжемся с вами для уточнения деталей.';
  });
})();
