(()=>{
  'use strict';

  const DEFAULT_LABEL='Скопировать';
  const COPIED_LABEL='Скопировано';
  const status=document.getElementById('copy-status');
  const resetTimers=new WeakMap();

  function setStatus(message){
    if(status)status.textContent=message;
  }

  function linkContext(button){
    const cardTitle=button.closest('.card')?.querySelector('h3')?.textContent?.trim();
    const rowTitle=button.closest('tr')?.querySelector('td')?.textContent?.trim();
    return cardTitle||rowTitle||'рекламная ссылка';
  }

  async function copyText(value){
    if(navigator.clipboard&&window.isSecureContext){
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea=document.createElement('textarea');
    textarea.value=value;
    textarea.setAttribute('readonly','');
    textarea.style.position='fixed';
    textarea.style.opacity='0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied=document.execCommand('copy');
    textarea.remove();
    if(!copied)throw new Error('copy_failed');
  }

  function scheduleReset(button){
    const current=resetTimers.get(button);
    if(current)window.clearTimeout(current);
    const timer=window.setTimeout(()=>{
      button.textContent=DEFAULT_LABEL;
      button.removeAttribute('data-copy-state');
      resetTimers.delete(button);
    },1400);
    resetTimers.set(button,timer);
  }

  document.addEventListener('click',async(event)=>{
    const button=event.target.closest('button[data-copy]');
    if(!button)return;

    const value=String(button.dataset.copy||'').trim();
    if(!value){
      setStatus('Ссылка для копирования не найдена.');
      return;
    }

    button.disabled=true;
    try{
      await copyText(value);
      button.textContent=COPIED_LABEL;
      button.dataset.copyState='success';
      setStatus(`Скопировано: ${linkContext(button)}.`);
      scheduleReset(button);
    }catch(error){
      button.textContent=DEFAULT_LABEL;
      button.removeAttribute('data-copy-state');
      setStatus('Не удалось скопировать ссылку автоматически. Выделите и скопируйте её вручную.');
    }finally{
      button.disabled=false;
    }
  });
})();
