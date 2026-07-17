import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_TARGETS,
  buildCampaignPost,
  buildCampaignUrl,
  currentCampaignTag,
} from './public-campaign-link-model.js?v=2';

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
  const builderPost=document.getElementById('builder-post');
  const builderCopyPost=document.getElementById('builder-copy-post');
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

  function scheduleReset(button,label=DEFAULT_LABEL){
    const current=resetTimers.get(button);
    if(current)window.clearTimeout(current);
    const timer=window.setTimeout(()=>{
      button.textContent=label;
      button.removeAttribute('data-copy-state');
      resetTimers.delete(button);
    },1400);
    resetTimers.set(button,timer);
  }

  function selectedChannel(){
    return CAMPAIGN_CHANNELS.find((item)=>item.id===builderChannel?.value)||CAMPAIGN_CHANNELS[0];
  }

  function renderBuilder(){
    if(!builderResult)return {url:'',post:''};
    const params={
      targetId:builderTarget?.value,
      channelId:builderChannel?.value,
      campaign:builderCampaign?.value,
      content:builderContent?.value,
    };
    const url=buildCampaignUrl(params);
    const post=buildCampaignPost(params);
    builderResult.href=url;
    builderResult.textContent=url;
    if(builderPost)builderPost.value=post;
    if(builderOpen)builderOpen.href=url;
    return {url,post};
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
    const value=renderBuilder().url;
    builderCopy.disabled=true;
    try{
      await copyText(value);
      builderCopy.textContent=COPIED_LABEL;
      builderCopy.dataset.copyState='success';
      setBuilderStatus('Ссылка скопирована. Вставьте её в публикацию, сообщение или QR-код.');
      scheduleReset(builderCopy,'Скопировать ссылку');
    }catch(error){
      builderCopy.textContent='Скопировать ссылку';
      builderCopy.removeAttribute('data-copy-state');
      setBuilderStatus('Не удалось скопировать автоматически. Выделите готовую ссылку и скопируйте её вручную.');
    }finally{
      builderCopy.disabled=false;
    }
  });
  builderCopyPost?.addEventListener('click',async()=>{
    const value=renderBuilder().post;
    builderCopyPost.disabled=true;
    try{
      await copyText(value);
      builderCopyPost.textContent='Пост скопирован';
      builderCopyPost.dataset.copyState='success';
      setBuilderStatus('Готовый текст со ссылкой скопирован. Его можно вставить в выбранный канал и при необходимости дополнить фотографией.');
      scheduleReset(builderCopyPost,'Скопировать пост');
    }catch(error){
      builderCopyPost.textContent='Скопировать пост';
      builderCopyPost.removeAttribute('data-copy-state');
      setBuilderStatus('Не удалось скопировать автоматически. Выделите готовый пост и скопируйте его вручную.');
    }finally{
      builderCopyPost.disabled=false;
    }
  });

  bootBuilder();
})();
