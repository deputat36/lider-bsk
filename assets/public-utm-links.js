import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_TARGETS,
  buildCampaignUrl,
  currentCampaignTag,
} from './public-campaign-link-model.js?v=1';

(()=>{
  'use strict';

  const DEFAULT_LABEL='Скопировать';
  const COPIED_LABEL='Скопировано';
  const status=document.getElementById('copy-status');
  const builderStatus=document.getElementById('builder-status');
  const builderTarget=document.getElementById('builder-target');
  const builderChannel=document.getElementById('builder-channel');
  const builderCampaign=document.getElementById('builder-campaign');
  const builderContent=document.getElementById('builder-content');
  const builderResult=document.getElementById('builder-result');
  const builderCopy=document.getElementById('builder-copy');
  const builderOpen=document.getElementById('builder-open');
  const resetTimers=new WeakMap();

  function setStatus(message){
    if(status)status.textContent=message;
  }

  function setBuilderStatus(message){
    if(builderStatus)builderStatus.textContent=message;
  }

  function fillSelect(select, items){
    if(!select)return;
    select.replaceChildren(...items.map((item)=>{
      const option=document.createElement('option');
      option.value=item.id;
      option.textContent=item.label;
      return option;
    }));
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

  function selectedChannel(){
    return CAMPAIGN_CHANNELS.find((item)=>item.id===builderChannel?.value)||CAMPAIGN_CHANNELS[0];
  }

  function renderBuilder(){
    if(!builderResult)return '';
    const value=buildCampaignUrl({
      targetId:builderTarget?.value,
      channelId:builderChannel?.value,
      campaign:builderCampaign?.value,
      content:builderContent?.value,
    });
    builderResult.href=value;
    builderResult.textContent=value;
    if(builderOpen)builderOpen.href=value;
    return value;
  }

  function bootBuilder(){
    if(!builderTarget||!builderChannel||!builderCampaign||!builderContent)return;
    fillSelect(builderTarget,CAMPAIGN_TARGETS);
    fillSelect(builderChannel,CAMPAIGN_CHANNELS);
    builderCampaign.value=currentCampaignTag();
    builderContent.value=selectedChannel().content;
    renderBuilder();
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

  builderTarget?.addEventListener('change',renderBuilder);
  builderCampaign?.addEventListener('input',renderBuilder);
  builderContent?.addEventListener('input',renderBuilder);
  builderChannel?.addEventListener('change',()=>{
    builderContent.value=selectedChannel().content;
    renderBuilder();
  });
  builderCopy?.addEventListener('click',async()=>{
    const value=renderBuilder();
    builderCopy.disabled=true;
    try{
      await copyText(value);
      builderCopy.textContent=COPIED_LABEL;
      builderCopy.dataset.copyState='success';
      setBuilderStatus('Ссылка скопирована. Вставьте её в публикацию, сообщение или QR-код.');
      scheduleReset(builderCopy);
    }catch(error){
      builderCopy.textContent=DEFAULT_LABEL;
      builderCopy.removeAttribute('data-copy-state');
      setBuilderStatus('Не удалось скопировать автоматически. Выделите готовую ссылку и скопируйте её вручную.');
    }finally{
      builderCopy.disabled=false;
    }
  });

  bootBuilder();
})();
