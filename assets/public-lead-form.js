// RA Lider public lead form, metrika goals, prefill, mobile sticky CTA and page helpers.
(function(){
  'use strict';

  const ENDPOINT='https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead';
  const catalog=window.LeaderServiceCatalog;
  const METRIKA_ID=109387236;
  const PENDING_STORAGE_KEY='leader_public_lead_pending_v1';
  const MAX_PENDING_AGE_MS=30*60*1000;
  const CAMPAIGN_STORAGE_KEY='leader_public_campaign_v1';
  const UTM_KEYS=['utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
  let campaignMemory=null;
  const CONSENT_VERSION='privacy-2026-07-12-v1';
  const MAX_MESSAGE_LENGTH=3000;

  const scenarios={
    shop:{service:'Комплексная реклама',text:'Сценарий: открываем / оформляем магазин. Нужны рекомендации по вывеске, баннеру, режиму работы, наклейкам, картам и соцсетям.'},
    cafe:{service:'Комплексная реклама',text:'Сценарий: кафе / доставка / общепит. Нужны рекомендации по меню, витрине, баннерам, соцсетям и карточкам в картах.'},
    service:{service:'Комплексная реклама',text:'Сценарий: сервис / ремонт / мастерская. Нужны рекомендации по фасадной рекламе, указателям, табличкам, прайсу и картам.'},
    beauty:{service:'Комплексная реклама',text:'Сценарий: салон / студия / частный мастер. Нужны рекомендации по логотипу, прайсу, сертификатам, соцсетям и карточке в картах.'},
    construction:{service:'Комплексная реклама',text:'Сценарий: строительство / недвижимость. Нужны рекомендации по баннерам, презентации, коммерческому предложению, листовкам и соцсетям.'},
    office:{service:'Комплексная реклама',text:'Сценарий: пункт выдачи / офис. Нужны рекомендации по табличкам, режиму работы, навигации, наклейкам и картам.'}
  };

  const servicePresets={
    'srochnaya-reklama-borisoglebsk.html':{service:'Комплексная реклама',text:'Срочная заявка: нужно быстро рассчитать рекламу. Срок: '},
    'reklama-v-socsetyah-borisoglebsk.html':{service:'Соцсети и контент',text:'Страница: реклама в соцсетях Борисоглебска. Нужно уточнить, что рекламируем, дату размещения, материалы и цель.'},
    'reklama-v-soobshchestvah-borisoglebska.html':{service:'Соцсети и контент',text:'Страница: реклама в сообществах Борисоглебска ВК/ОК. Нужно уточнить товар/услугу, сроки, формат размещения, готовность текста/изображения и желаемые сообщества.'},
    'reklamnye-posty-vk-borisoglebsk.html':{service:'Соцсети и контент',text:'Страница: рекламные посты ВК в Борисоглебске. Нужно уточнить товар/услугу, оффер, формат поста, изображение, сроки и желаемые сообщества.'},
    'reklama-dlya-meropriyatiy-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама мероприятия. Нужно уточнить дату, место, афишу, условия входа, контакты и желаемые размещения.'},
    'reklama-dlya-kafe-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для кафе / доставки. Нужно уточнить меню, акции, адрес, график, соцсети, карты и нужные макеты.'},
    'reklama-dlya-salona-krasoty-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для салона / мастера. Нужно уточнить услуги, прайс, соцсети, карты, сертификаты, таблички, наклейки и оформление.'},
    'reklama-dlya-servisa-masterskoy-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для сервиса / мастерской. Нужно уточнить услуги, прайс, вход, вывеску, таблички, соцсети, карты, сроки и нужные макеты.'},
    'reklama-dlya-magazina-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама для магазина. Нужно уточнить вход, витрину, баннер, режим работы, карты, соцсети и макеты.'},
    'reklama-otkrytiya-magazina-borisoglebsk.html':{service:'Комплексная реклама',text:'Страница: реклама открытия магазина. Нужно уточнить дату открытия, адрес, направление магазина, фото входа/витрины, бюджет и нужные материалы.'},
    'outdoor-advertising-borisoglebsk.html':{service:'Вывеска / наружная реклама',text:'Страница услуги: наружная реклама. Клиент интересуется баннерами, вывесками, табличками, указателями или оформлением входной группы.'},
    'bannery-borisoglebsk.html':{service:'Баннер',text:'Страница услуги: баннер. Нужно уточнить размер, место размещения, наличие макета, срок, люверсы, доставку или монтаж.'},
    'pechat-bannerov-borisoglebsk.html':{service:'Баннер',text:'Страница: печать баннеров. Нужно уточнить размер, место размещения, наличие макета, срок, люверсы, доставку или монтаж.'},
    'banner-dlya-magazina-borisoglebsk.html':{service:'Баннер',text:'Страница: баннер для магазина. Нужно уточнить размер, место размещения, текст акции/предложения, наличие макета, срок и крепление.'},
    'vyveski-borisoglebsk.html':{service:'Вывеска / наружная реклама',text:'Страница услуги: вывеска. Нужно уточнить место размещения, размер, фото фасада, макет, сроки и нужен ли монтаж.'},
    'oformlenie-vhoda-borisoglebsk.html':{service:'Вывеска / наружная реклама',text:'Страница: оформление входной группы. Нужно уточнить фото входа, размеры, какие элементы нужны: вывеска, режим работы, табличка, наклейки, навигация.'},
    'pechat-na-plenke-borisoglebsk.html':{service:'Печать на плёнке',text:'Страница услуги: печать на плёнке. Нужно уточнить размер, количество, где будет использоваться плёнка и нужен ли макет.'},
    'oformlenie-vitrin-borisoglebsk.html':{service:'Печать на плёнке',text:'Страница услуги: оформление витрин. Нужно уточнить фото витрины, размеры, что разместить на стекле и нужен ли монтаж.'},
    'nakleyki-plotternaya-rezka-borisoglebsk.html':{service:'Наклейки',text:'Страница услуги: наклейки и плоттерная резка. Нужно уточнить размер, цвет, количество, куда клеить и нужен ли макет.'},
    'nakleyki-na-vitrinu-borisoglebsk.html':{service:'Наклейки',text:'Страница: наклейки на витрину. Нужно уточнить фото стекла, размеры, текст/логотип/акцию, количество и нужен ли монтаж.'},
    'tablichki-borisoglebsk.html':{service:'Табличка',text:'Страница услуги: табличка. Нужно уточнить текст, размер, материал, место размещения и способ крепления.'},
    'rezhim-raboty-tablichki-borisoglebsk.html':{service:'Табличка',text:'Страница: режим работы и таблички. Нужно уточнить текст, размер, материал, место размещения, количество и нужен ли монтаж.'},
    'dizayn-maketov.html':{service:'Дизайн макета',text:'Страница услуги: дизайн макета. Нужно уточнить формат, размер, текст, логотип, примеры и где будет использоваться макет.'},
    'logotip-firmennyy-stil.html':{service:'Логотип / фирменный стиль',text:'Страница услуги: логотип и фирменный стиль. Нужно уточнить направление бизнеса, пожелания по стилю и где будет использоваться логотип.'},
    'poligrafiya-borisoglebsk.html':{service:'Полиграфия',text:'Страница услуги: полиграфия. Нужно уточнить вид продукции, формат, тираж, материал, макет и сроки.'},
    'vizitki-borisoglebsk.html':{service:'Визитки',text:'Страница услуги: визитки. Нужно уточнить тираж, формат, стороны печати, бумагу, ламинацию, макет и сроки.'},
    'socseti-kontent.html':{service:'Соцсети и контент',text:'Страница услуги: соцсети и контент. Нужно уточнить ссылку на группу, что оформить, сколько постов и какие услуги продвигать.'},
    'yandex-karty-2gis.html':{service:'Яндекс Карты и 2ГИС',text:'Страница услуги: Яндекс Карты и 2ГИС. Нужно уточнить название организации, город, ссылку на карточку и что нужно заполнить или исправить.'},
    'audit-kart-yandex-2gis-borisoglebsk.html':{service:'Яндекс Карты и 2ГИС',text:'Страница: аудит Яндекс Карт и 2ГИС. Нужно уточнить название организации, город, ссылку на карточку, что проверить и какие данные нужно исправить.'},
    'primery-rabot-kejsy.html':{service:'Комплексная реклама',text:'Страница: примеры работ и кейсы. Клиент хочет похожую рекламу. Нужно уточнить, какой пример понравился, формат, размеры, место размещения, сроки и материалы.'}
  };

  window.LEADER_METRIKA_ID=METRIKA_ID;
  window.leaderGoal=function(name,params){
    params=params||{};
    try{if(typeof window.ym==='function')window.ym(METRIKA_ID,'reachGoal',name,params)}catch(e){}
    try{window.dispatchEvent(new CustomEvent('leader:goal',{detail:{goal:name,params:params}}))}catch(e){}
  };

  function goal(name,params){if(window.leaderGoal)window.leaderGoal(name,params||{})}
  function pageKey(){return (location.pathname.split('/').pop()||'index.html').toLowerCase()}
  function homeOnly(){return location.pathname==='/'||location.pathname.endsWith('/index.html')}
  function uid(prefix){return prefix+'-'+Math.random().toString(36).slice(2,9)}
  function clean(value){return String(value||'').trim()}
  function field(form,name){const el=form.querySelector('[name="'+name+'"]');return el?clean(el.value):''}
  function requestId(){return 'web-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10)}
  function normalizePhone(value){const digits=clean(value).replace(/\D+/g,'');return digits.length>=11?digits.slice(-10):digits}
  function fingerprint(payload){
    const source=[normalizePhone(payload.phone),clean(payload.service).toLowerCase(),clean(payload.page_path).toLowerCase(),clean(payload.message)].join('|');
    let hash=2166136261;
    for(let i=0;i<source.length;i+=1){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return 'fnv1a-'+(hash>>>0).toString(16).padStart(8,'0');
  }
  function readPending(){
    try{
      const value=JSON.parse(window.sessionStorage.getItem(PENDING_STORAGE_KEY)||'null');
      if(!value||!value.request_id||!value.fingerprint)return null;
      if(Date.now()-Number(value.created_at||0)>MAX_PENDING_AGE_MS){window.sessionStorage.removeItem(PENDING_STORAGE_KEY);return null}
      return value;
    }catch(_){return null}
  }
  function writePending(value){try{window.sessionStorage.setItem(PENDING_STORAGE_KEY,JSON.stringify(value))}catch(_){}}
  function clearPending(){try{window.sessionStorage.removeItem(PENDING_STORAGE_KEY)}catch(_){}}
  function stableRequestId(payload){
    const currentFingerprint=fingerprint(payload);
    const pending=readPending();
    if(pending&&pending.fingerprint===currentFingerprint)return pending.request_id;
    const id=requestId();
    writePending({request_id:id,fingerprint:currentFingerprint,created_at:Date.now()});
    return id;
  }
  function setStatus(form,type,msg){const s=form.querySelector('[data-leader-lead-status]');if(s){s.className='leader-lead-status show '+type;s.textContent=msg}}
  function qs(){const p=new URLSearchParams(location.search);return{utm_source:p.get('utm_source')||'',utm_medium:p.get('utm_medium')||'',utm_campaign:p.get('utm_campaign')||'',utm_term:p.get('utm_term')||'',utm_content:p.get('utm_content')||'',scenario:p.get('scenario')||'',service:p.get('service')||'',offer:p.get('offer')||''}}

  // Retain the last campaign during this visit, including navigation without UTM.
  // Only campaign fields are stored; contact data and full URLs are never saved.
  function campaignAttribution(){
    const query=qs();
    if(UTM_KEYS.some(key=>clean(query[key]))){
      campaignMemory={created_at:Date.now(),values:Object.fromEntries(UTM_KEYS.map(key=>[key,clean(query[key]).slice(0,200)]))};
      try{window.sessionStorage.setItem(CAMPAIGN_STORAGE_KEY,JSON.stringify(campaignMemory))}catch(_){}
    }else if(!campaignMemory){
      try{campaignMemory=JSON.parse(window.sessionStorage.getItem(CAMPAIGN_STORAGE_KEY)||'null')}catch(_){}
    }
    const age=Date.now()-Number(campaignMemory&&campaignMemory.created_at);
    if(!campaignMemory||!Number.isFinite(age)||age<0||age>MAX_PENDING_AGE_MS){
      campaignMemory=null;
      try{window.sessionStorage.removeItem(CAMPAIGN_STORAGE_KEY)}catch(_){}
    }
    return Object.fromEntries(UTM_KEYS.map(key=>[key,clean(campaignMemory&&campaignMemory.values&&campaignMemory.values[key]).slice(0,200)]));
  }

  function loadMetrika(){
    if(window.__leaderMetrikaLoaded)return;
    window.__leaderMetrikaLoaded=true;
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');
    try{window.ym(METRIKA_ID,'init',{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true})}catch(e){}
  }

  function scrollToForm(){
    const req=document.getElementById('request')||document.getElementById('leader-lead-form')||document.querySelector('[data-leader-lead-form]');
    if(req)req.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function applyServicePreset(preset,scroll){
    if(!preset)return;
    document.querySelectorAll('[data-leader-lead-widget]').forEach(form=>{
      const service=form.querySelector('[name="service"]');
      const message=form.querySelector('[name="message"]');
      if(service&&preset.service)service.value=preset.service;
      form.__leaderOfferId=preset.offer_id||'';
      renderSelectedOffer(form);
      if(message&&preset.text&&!message.value.trim()){
        message.value=preset.text;
        form.__leaderAutoMessage=preset.text;
      }
      renderServiceBrief(form);
      updateMessageBudget(form);
    });
    if(scroll)scrollToForm();
  }
  function applyScenario(key,scroll){const s=scenarios[key];if(s)applyServicePreset(s,scroll)}
  function currentPreset(){
    const q=qs();
    const selected=catalog&&catalog.find(q.service);
    const legacy=servicePresets[pageKey()];
    const item=selected||(catalog&&catalog.forPage(pageKey()));
    if(!item)return legacy||null;
    const offer=catalog.findOffer&&catalog.findOffer(q.offer);
    return{service:item.label,text:selected?'Услуга выбрана по ссылке: '+item.label:(legacy?legacy.text:'Интересует: '+item.label),offer_id:offer&&offer.service_id===item.id?offer.id:''};
  }

  function selectedOffer(form){
    const offer=catalog&&catalog.findOffer&&catalog.findOffer(form.__leaderOfferId);
    const service=catalog&&catalog.find(field(form,'service'));
    return offer&&service&&offer.service_id===service.id?offer:null;
  }

  function renderSelectedOffer(form){
    const offer=selectedOffer(form);
    if(!offer)form.__leaderOfferId='';
    const note=form.querySelector('[data-leader-offer-note]');
    if(note){
      note.hidden=!offer;
      note.textContent=offer?'Выбранный состав: «'+offer.label+'». Стоимость и сроки согласуем после уточнения задачи.':'';
    }
  }

  // Keep optional answers in this form only; changing a service never mixes briefs.
  function renderServiceBrief(form){
    const box=form.querySelector('[data-leader-service-brief]');
    if(!box)return;
    const drafts=form.__leaderBriefDrafts||(form.__leaderBriefDrafts=Object.create(null));
    if(form.__leaderBriefId)drafts[form.__leaderBriefId]=[0,1,2,3].map(i=>field(form,'brief_'+i));
    const item=catalog&&catalog.find(field(form,'service'));
    box.replaceChildren();
    box.hidden=!(item&&item.brief);
    form.__leaderBriefId=item&&item.brief?item.id:'';
    if(box.hidden)return;
    const title=document.createElement('h4');
    title.textContent='Подробности: '+item.label;
    box.appendChild(title);
    const note=document.createElement('p');
    note.textContent='Заполните то, что уже известно. Эти поля необязательные; фото и файлы можно передать при обсуждении.';
    box.appendChild(note);
    item.questions.forEach((question,i)=>{
      const row=document.createElement('div');
      const label=document.createElement('label');
      const input=document.createElement('input');
      input.type='text';input.name='brief_'+i;input.maxLength=180;
      input.id=form.querySelector('[name="service"]').id+'-brief-'+i;
      const budgetNote=form.querySelector('[data-leader-message-budget]');
      if(budgetNote)input.setAttribute('aria-describedby',budgetNote.id);
      input.placeholder='Если известно';input.autocomplete='off';
      input.value=(drafts[item.id]||[])[i]||'';
      label.htmlFor=input.id;label.textContent=question;
      row.append(label,input);box.appendChild(row);
    });
  }

  function composeMessage(form,compact){
    const parts=['Источник: сайт РА Лидер'];
    const service=field(form,'service');
    const serviceInfo=catalog&&catalog.find(service);
    if(!compact)parts.push('Страница: '+(document.title||'').replace(/\s+/g,' ').trim());
    if(service)parts.push('Услуга: '+service);
    if(!compact&&serviceInfo)parts.push('Направление: '+catalog.directions[serviceInfo.direction]);
    const offer=selectedOffer(form);
    if(offer)parts.push('Состав заказа: '+offer.label);
    if(serviceInfo&&serviceInfo.brief){
      serviceInfo.questions.forEach((question,i)=>{
        const answer=field(form,'brief_'+i);
        if(answer)parts.push('Бриф — '+question+' '+answer);
      });
    }
    const labels=[['message','Задача клиента'],['city','Город'],['business','Бизнес/объект'],
      ['contact_method','Удобная связь'],['contact_detail','Контакт для выбранного способа'],
      ['quantity','Количество/формат'],['deadline','Срок'],['mockup','Макет'],
      ['delivery','Доставка/монтаж'],['budget','Бюджет']];
    labels.forEach(([name,label])=>{const value=field(form,name);if(value)parts.push(label+': '+value)});
    if(!compact)parts.push('URL: '+location.href);
    return parts.join('\n');
  }

  function messageForSubmission(form){
    const full=composeMessage(form,false);
    // Page and direction also travel in separate payload fields. Only
    // their repeated presentation can be omitted; client answers never are.
    return full.length<=MAX_MESSAGE_LENGTH?full:composeMessage(form,true);
  }

  function messageLengthHint(length){
    const remaining=MAX_MESSAGE_LENGTH-length;
    const count=Math.abs(remaining),last=count%10,hundred=count%100;
    const unit=hundred>=11&&hundred<=14?'символов':last===1?'символ':last>=2&&last<=4?'символа':'символов';
    return remaining<0?'Сократите описание или ответы на '+count+' '+unit+', чтобы отправить заявку целиком. Подробное ТЗ можно передать при обсуждении заказа.':
      'До лимита заявки: '+count+' '+unit+'. Подробное ТЗ можно передать при обсуждении заказа.';
  }

  function updateMessageBudget(form){
    const length=messageForSubmission(form).length;
    const note=form.querySelector('[data-leader-message-budget]');
    if(note){
      note.hidden=length<MAX_MESSAGE_LENGTH*0.9;
      note.textContent=note.hidden?'':messageLengthHint(length);
    }
    if(form.__leaderMessageTooLong&&length<=MAX_MESSAGE_LENGTH){
      const lengthError=form.__leaderMessageTooLong;
      form.__leaderMessageTooLong='';
      if(form.querySelector('[data-leader-lead-status]')?.textContent===lengthError)setStatus(form,'','');
    }
    return length;
  }

  function contactMode(form){
    const method=field(form,'contact_method');
    return method==='Написать на email'?'email':method==='Написать ВКонтакте'?'vk':'optional';
  }

  function contactDetailError(form){
    const mode=contactMode(form),value=field(form,'contact_detail');
    if(mode==='optional')return '';
    if(!value)return mode==='email'?'Укажите email для выбранного способа связи.':'Укажите ссылку на профиль ВКонтакте.';
    const detail=form.querySelector('[name="contact_detail"]');
    if(mode==='email')return detail.validity?.typeMismatch?'Проверьте email: например, name@example.ru.':'';
    try{
      const url=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
      if(['http:','https:'].includes(url.protocol)&&/^(?:(?:www|m)\.)?vk\.(?:com|ru)$/.test(url.hostname)&&!url.username&&!url.password&&!url.port&&url.pathname.replace(/\//g,'').trim())return '';
    }catch(_){}
    return 'Укажите ссылку на страницу ВКонтакте: например, https://vk.com/id123.';
  }

  function revealContactDetails(form){
    const details=form.querySelector('[data-leader-details]');
    const more=form.querySelector('[data-leader-more]');
    if(details){details.removeAttribute('hidden');more?.setAttribute('aria-expanded','true');if(more)more.textContent='Скрыть подробности ↑'}
  }

  function updateContactValidity(form){
    const detail=form.querySelector('[name="contact_detail"]');
    const error=contactDetailError(form);
    detail.setCustomValidity?.(error);
    // Only remove this validator's own status, preserving network/phone/length errors.
    const previous=form.__leaderContactError;
    if(previous&&form.querySelector('[data-leader-lead-status]')?.textContent===previous){
      if(error)setStatus(form,'err',error);else setStatus(form,'','');
    }
    form.__leaderContactError=previous?error:'';
    detail.setAttribute('aria-invalid',form.__leaderContactError?'true':'false');
    const hint=form.querySelector('[data-leader-contact-hint]');
    if(hint){hint.textContent=form.__leaderContactError||hint.dataset.defaultText;hint.classList.toggle('leader-contact-hint-error',!!form.__leaderContactError)}
    return error;
  }

  function showContactError(form,error){
    revealContactDetails(form);
    form.__leaderContactError=error;
    setStatus(form,'err',error);
    const detail=form.querySelector('[name="contact_detail"]');
    detail.setAttribute('aria-invalid','true');
    const hint=form.querySelector('[data-leader-contact-hint]');
    if(hint){hint.textContent=error;hint.classList.add('leader-contact-hint-error')}
    detail.focus?.({preventScroll:true});
    detail.scrollIntoView?.({block:'center'});
    const params={contact_method:field(form,'contact_method'),page_path:location.pathname};
    if(!field(form,'contact_detail'))goal('contact_detail_missing',params);
    else goal('lead_validation_error',{...params,reason:'contact_detail_invalid'});
  }

  function applyContactMode(form){
    const mode=contactMode(form),required=mode!=='optional';
    const detail=form.querySelector('[name="contact_detail"]');
    detail.required=required;
    detail.setAttribute('aria-required',required?'true':'false');
    detail.type=mode==='email'?'email':'text';
    detail.inputMode=mode==='email'?'email':mode==='vk'?'url':'text';
    detail.autocomplete=mode==='email'?'email':'off';
    detail.closest('.leader-lead-span-12')?.classList.toggle('leader-contact-detail-required',required);
    const label=form.querySelector('label[for="'+detail.id+'"]');
    const hint=form.querySelector('[data-leader-contact-hint]');
    if(label)label.textContent=mode==='email'?'Email для ответа':mode==='vk'?'Ссылка на профиль ВКонтакте':'Email или ссылка на профиль';
    detail.placeholder=mode==='email'?'Например, name@example.ru':mode==='vk'?'Например, https://vk.com/id123':'Необязательно для звонка или MAX по указанному номеру';
    if(hint){hint.dataset.defaultText=mode==='email'?'Укажите адрес, на который отправить ответ.':mode==='vk'?'Подойдёт ссылка на профиль или страницу: vk.com/имя или vk.ru/имя.':'Для звонка или MAX достаточно указанного телефона.';hint.textContent=hint.dataset.defaultText}
    if(required)revealContactDetails(form);
    return updateContactValidity(form);
  }

  function mountContactMethod(form){
    if(form.dataset.contactMethodGuard==='1')return;
    form.dataset.contactMethodGuard='1';
    const method=form.querySelector('[name="contact_method"]');
    const detail=form.querySelector('[name="contact_detail"]');
    method.addEventListener('change',()=>applyContactMode(form));
    detail.addEventListener('input',()=>updateContactValidity(form));
    detail.addEventListener('invalid',event=>{
      const error=updateContactValidity(form);
      if(error){event.preventDefault();showContactError(form,error)}
    });
    applyContactMode(form);
  }

  function buildFormHtml(id){
    return `<form class="leader-lead-widget" data-leader-lead-widget>
      <h3>Быстрая заявка</h3>
      <p>Заполните коротко. Мы сами уточним детали, если данных будет недостаточно.</p>
      <input class="leader-lead-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="leader-lead-grid">
        <div class="leader-lead-span-6"><label for="${id}-name">Имя / организация</label><input id="${id}-name" name="name" type="text" autocomplete="name" maxlength="200" placeholder="Например, Алексей"></div>
        <div class="leader-lead-span-6"><label for="${id}-phone">Телефон</label><input id="${id}-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="80" placeholder="+7..." required></div>
        <div class="leader-lead-span-12"><label for="${id}-service">Что нужно?</label><select id="${id}-service" name="service" required>${catalog?catalog.services.map(item=>`<option value="${item.label}"${item.id==='other'?' selected':''}>${item.label}</option>`).join(''):'<option value="">Услуги временно недоступны</option>'}</select><div class="leader-lead-note" data-leader-offer-note role="status" hidden></div></div>
        <div class="leader-lead-span-12"><label for="${id}-message">Коротко опишите задачу</label><textarea id="${id}-message" name="message" maxlength="2000" rows="3" aria-describedby="${id}-message-budget" placeholder="Например: нужен рекламный пост, баннер или наклейки"></textarea><div id="${id}-message-budget" class="leader-lead-note" data-leader-message-budget role="status" aria-live="polite" hidden></div></div>
      </div>
      <button class="leader-lead-more" type="button" data-leader-more aria-expanded="false" aria-controls="${id}-details">Добавить подробности для точного расчёта ↓</button>
      <div class="leader-lead-details" id="${id}-details" data-leader-details hidden>
        <div class="leader-service-brief" data-leader-service-brief hidden></div>
        <div class="leader-lead-grid">
          <div class="leader-lead-span-6"><label for="${id}-city">Город</label><input id="${id}-city" name="city" autocomplete="address-level2" maxlength="120" placeholder="Борисоглебск"></div>
          <div class="leader-lead-span-6"><label for="${id}-contact">Как удобнее связаться?</label><select id="${id}-contact" name="contact_method"><option>Позвонить по указанному номеру</option><option>Написать в MAX по указанному номеру</option><option>Написать ВКонтакте</option><option>Написать на email</option><option>Любой удобный способ</option></select></div>
          <div class="leader-lead-span-12"><label for="${id}-contact-detail">Email или ссылка на профиль</label><input id="${id}-contact-detail" name="contact_detail" maxlength="300" aria-describedby="${id}-contact-hint" placeholder="Заполните, если выбрали email или ВКонтакте"><small id="${id}-contact-hint" class="leader-contact-hint" data-leader-contact-hint></small></div>
          <div class="leader-lead-span-6"><label for="${id}-quantity">Количество / формат</label><input id="${id}-quantity" name="quantity" maxlength="120" placeholder="1 пост, пакет, закреп, 100 наклеек"></div>
          <div class="leader-lead-span-6"><label for="${id}-deadline">Когда нужно?</label><select id="${id}-deadline" name="deadline"><option>Не срочно</option><option>Как можно быстрее</option><option>В течение 2–3 дней</option><option>В течение недели</option><option>К определённой дате</option><option>Нужно обсудить</option></select></div>
          <div class="leader-lead-span-6"><label for="${id}-mockup">Макет</label><select id="${id}-mockup" name="mockup"><option>Макета нет, нужен дизайн</option><option>Макет готов</option><option>Есть пример, нужно доработать</option><option>Пока не знаю</option></select></div>
          <div class="leader-lead-span-6"><label for="${id}-delivery">Доставка / монтаж</label><select id="${id}-delivery" name="delivery"><option>Не требуется</option><option>Нужна доставка</option><option>Нужен монтаж</option><option>Доставка и монтаж</option><option>Нужно обсудить</option></select></div>
          <div class="leader-lead-span-6"><label for="${id}-budget">Ориентировочный бюджет</label><select id="${id}-budget" name="budget"><option>Не знаю, нужен расчёт</option><option>До 3 000 ₽</option><option>3 000–10 000 ₽</option><option>10 000–30 000 ₽</option><option>Более 30 000 ₽</option></select></div>
          <div class="leader-lead-span-6"><label for="${id}-business">Бизнес / объект</label><input id="${id}-business" name="business" maxlength="160" placeholder="Магазин, кафе, офис, мероприятие..."></div>
        </div>
      </div>
      <button type="submit">Отправить заявку</button>
      <div class="leader-lead-note">Нажимая кнопку, вы соглашаетесь с <a href="privacy.html">политикой обработки персональных данных</a> для связи и расчёта заказа.</div>
      <div class="leader-lead-status" data-leader-lead-status role="status" aria-live="polite" aria-atomic="true"></div>
    </form>`;
  }

  function mount(target){
    if(target.dataset.leaderMounted==='1')return;
    target.dataset.leaderMounted='1';
    const id=uid('ll');
    target.innerHTML=buildFormHtml(id);
    const form=target.querySelector('form');
    const more=form.querySelector('[data-leader-more]');
    const details=form.querySelector('[data-leader-details]');
    const markFormStart=function(){
      if(form.dataset.started==='1')return;
      form.dataset.started='1';
      goal('form_start',{page:location.href,page_path:location.pathname,service:field(form,'service')});
    };
    form.addEventListener('input',markFormStart);
    form.addEventListener('change',markFormStart);
    form.addEventListener('input',()=>updateMessageBudget(form));
    form.addEventListener('change',()=>updateMessageBudget(form));
    form.querySelector('[name="service"]').addEventListener('change',()=>{
      const message=form.querySelector('[name="message"]');
      if(message&&message.value===form.__leaderAutoMessage&&/^Интересует:|^Услуга выбрана/.test(message.value)){
        message.value='Интересует: '+field(form,'service');
        form.__leaderAutoMessage=message.value;
      }
      renderSelectedOffer(form);
      renderServiceBrief(form);
    });
    renderServiceBrief(form);
    more.addEventListener('click',()=>{
      if(details.hasAttribute('hidden')){
        details.removeAttribute('hidden');
        more.setAttribute('aria-expanded','true');
        more.textContent='Скрыть подробности ↑';
        goal('form_details_open',{page:location.href,page_path:location.pathname,service:field(form,'service')});
      }else{
        details.setAttribute('hidden','');
        more.setAttribute('aria-expanded','false');
        more.textContent='Добавить подробности для точного расчёта ↓';
      }
    });
    mountContactMethod(form);
    form.addEventListener('submit',submit);
    setTimeout(()=>goal('form_view',{page:location.href,page_path:location.pathname,service:field(form,'service')}),0);
  }

  async function submit(e){
    e.preventDefault();
    const form=e.currentTarget;
    const btn=form.querySelector('button[type="submit"]');
    if(form.dataset.submitting==='1')return;

    const name=field(form,'name');
    const phone=field(form,'phone');
    const service=field(form,'service');
    const city=field(form,'city');
    const contact_method=field(form,'contact_method');
    const contact_detail=field(form,'contact_detail');
    const quantity=field(form,'quantity');
    const deadline=field(form,'deadline');
    const mockup=field(form,'mockup');
    const delivery=field(form,'delivery');
    const budget=field(form,'budget');
    const business=field(form,'business');

    if(!service){setStatus(form,'err','Выберите услугу или позвоните по номеру 8 980 245-74-71.');return}
    if(!phone){setStatus(form,'err','Укажите телефон, чтобы мы могли связаться с вами.');return}

    const contactError=applyContactMode(form);
    if(contactError){showContactError(form,contactError);return}

    const pageTitle=(document.title||'').replace(/\s+/g,' ').trim();
    const submittedAt=new Date().toISOString();
    const serviceInfo=catalog&&catalog.find(service);
    const message=messageForSubmission(form);
    updateMessageBudget(form);
    if(message.length>MAX_MESSAGE_LENGTH){
      const lengthError=messageLengthHint(message.length);
      setStatus(form,'err',lengthError);
      form.__leaderMessageTooLong=lengthError;
      form.querySelector('[name="message"]').focus?.();
      goal('lead_validation_error',{reason:'message_too_long',page_path:location.pathname});
      return;
    }

    const utm=campaignAttribution();
    const payload={
      name,
      phone,
      service,
      service_id:serviceInfo?serviceInfo.id:'',
      direction:serviceInfo?serviceInfo.direction:'',
      source:'Сайт',
      message,
      page_url:location.href,
      page_path:location.pathname,
      page_title:pageTitle,
      submitted_at:submittedAt,
      user_agent:navigator.userAgent||'',
      city,
      quantity,
      contact_method,
      contact_detail,
      deadline,
      mockup,
      delivery,
      budget,
      business,
      consent_version:CONSENT_VERSION,
      ...utm,
      website:field(form,'website')
    };
    const rid=stableRequestId(payload);
    payload.request_id=rid;

    form.dataset.submitting='1';
    btn.disabled=true;
    btn.textContent='Отправляем...';
    goal('form_submit_attempt',{service,page:location.href,page_path:location.pathname,request_id:rid});
    try{
      const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      let data={};
      try{data=await res.json()}catch(parseError){data={}}
      const responseRequestId=clean(data.request_id)||rid;
      if(!res.ok||data.ok!==true)throw new Error('Ошибка '+res.status);
      clearPending();
      form.dataset.lastRequestId=responseRequestId;
      const duplicate=data&&data.duplicate===true;
      const successText=(duplicate?'Заявка уже была отправлена ранее. ':'Заявка отправлена. ')+'Номер обращения: '+responseRequestId+'. Мы свяжемся с вами для уточнения деталей.';
      setStatus(form,'ok',successText);
      // Legacy CI marker: goal('lead_sent',{service,page:location.href,request_id:rid})
      goal('lead_sent',{service,page:location.href,page_path:location.pathname,request_id:responseRequestId,duplicate});
      form.reset();
      applyContactMode(form);
      const serviceSelect=form.querySelector('[name="service"]');
      if(serviceSelect)serviceSelect.value=service;
      form.__leaderBriefDrafts=Object.create(null);
      form.__leaderBriefId='';
      renderServiceBrief(form);
      updateMessageBudget(form);
    }catch(err){
      console.error(err);
      setStatus(form,'err','Не удалось отправить заявку. Позвоните по номеру 8 980 245-74-71 или попробуйте ещё раз.');
      goal('lead_send_error',{service,page:location.href,page_path:location.pathname,request_id:rid});
    }finally{
      form.dataset.submitting='0';
      btn.disabled=false;
      btn.textContent='Отправить заявку';
    }
  }

  function injectMobileStickyCta(){
    if(document.getElementById('leader-mobile-sticky-cta'))return;
    if(homeOnly()&&document.querySelector('.mobile-cta'))return;
    const request=document.getElementById('request')||document.getElementById('leader-lead-form')||document.querySelector('[data-leader-lead-form]');
    const requestHref=request?'#'+(request.id||'request'):'/#request';
    const style=document.createElement('style');
    style.id='leader-mobile-sticky-cta-style';
    style.textContent='@media(max-width:760px){body{padding-bottom:76px}.leader-mobile-sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:flex;gap:8px;padding:10px 12px;background:rgba(255,255,255,.96);border-top:1px solid #e5e7eb;box-shadow:0 -12px 30px rgba(15,23,42,.14);backdrop-filter:blur(12px)}.leader-mobile-sticky-cta a{flex:1;min-height:48px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:900}.leader-mobile-sticky-cta__lead{background:#ff6a00;color:#fff}.leader-mobile-sticky-cta__phone{background:#111827;color:#fff}}@media(min-width:761px){.leader-mobile-sticky-cta{display:none}}';
    document.head.appendChild(style);
    const bar=document.createElement('div');
    bar.id='leader-mobile-sticky-cta';
    bar.className='leader-mobile-sticky-cta';
    bar.innerHTML='<a class="leader-mobile-sticky-cta__lead" href="'+requestHref+'">Оставить заявку</a><a class="leader-mobile-sticky-cta__phone" href="tel:+79802457471">Позвонить</a>';
    document.body.appendChild(bar);
    bar.addEventListener('click',function(e){const a=e.target.closest('a');if(!a)return;goal(a.href.indexOf('tel:')===0?'mobile_phone_click':'mobile_cta_click',{page:location.href,page_path:location.pathname});});
  }

  function injectCommunityPrices(){
    if(pageKey()!=='reklama-v-soobshchestvah-borisoglebska.html'||document.getElementById('community-price-block'))return;
    const anchor=document.getElementById('formats')||document.getElementById('communities')||document.getElementById('request');
    if(!anchor)return;
    const style=document.createElement('style');
    style.id='community-price-style';
    style.textContent='.community-price-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.community-price-card{border:1px solid #e5e7eb;border-radius:24px;padding:24px;background:#fff;box-shadow:0 18px 48px rgba(15,23,42,.10)}.community-price-card.main{border:2px solid #f6c343}.community-price-card h3{margin:0 0 8px;font-size:23px}.community-price-value{font-size:34px;line-height:1;font-weight:900;margin:10px 0;color:#111827}.community-price-card p{color:#667085}.community-price-note{margin-top:18px;background:#fff7d6;border:1px solid #fde68a;border-radius:22px;padding:18px;color:#5a3b00;font-weight:800}@media(max-width:900px){.community-price-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    const section=document.createElement('section');
    section.id='community-price-block';
    section.className='section soft';
    section.innerHTML='<div class="wrap"><h2>Цены на размещение рекламы</h2><p class="lead">Ориентиры по стоимости. Итог зависит от выбранных сообществ, количества публикаций, закрепа, сроков и сложности изображения.</p><div class="community-price-grid"><article class="community-price-card main"><h3>Разовый рекламный пост</h3><div class="community-price-value">от 300 ₽</div><p>Один пост в подходящем сообществе. Подходит для акции, объявления, открытия, услуги или проверки спроса.</p><a class="btn btn-dark" data-service="Соцсети и контент" href="#request">Заказать пост</a></article><article class="community-price-card main"><h3>Пакет размещений</h3><div class="community-price-value">от 1200 ₽</div><p>Несколько публикаций в разных группах или серия выходов по одной теме. Подходит для охвата и мероприятий.</p><a class="btn btn-dark" data-service="Соцсети и контент" href="#request">Подобрать пакет</a></article><article class="community-price-card"><h3>Закреп поста</h3><div class="community-price-value">от 1000 ₽</div><p>Стоимость за неделю, если закреп доступен в выбранном сообществе.</p><a class="btn btn-dark" data-service="Соцсети и контент" href="#request">Уточнить закреп</a></article><article class="community-price-card"><h3>Текст к посту</h3><div class="community-price-value">в подарок</div><p>Подготовим понятный рекламный текст: что предлагаете, где находится, как связаться и почему стоит обратиться сейчас.</p></article><article class="community-price-card"><h3>Простое изображение</h3><div class="community-price-value">бесплатно</div><p>Карточка к посту: заголовок, фото или фон, контакты, цена, акция или дата мероприятия.</p></article><article class="community-price-card"><h3>Сложное изображение</h3><div class="community-price-value">от 300 ₽</div><p>Афиша, коллаж, несколько объектов, обработка фото или более сложная композиция.</p></article></div><div class="community-price-note">Текст к посту и простое изображение можно подготовить без доплаты. Если нужен сложный дизайн или серия разных макетов — рассчитаем отдельно.</div></div>';
    anchor.parentNode.insertBefore(section,anchor);
  }

  function initClicks(){
    document.addEventListener('click',e=>{
      const a=e.target.closest&&e.target.closest('a');
      if(!a)return;
      const href=a.getAttribute('href')||'';
      const text=(a.textContent||'').trim();
      if(href==='#request'||href==='#leader-lead-form')goal('request_block_click',{service:field(document.querySelector('[data-leader-lead-widget]')||document,'service'),page_path:location.pathname});
      if(href.indexOf('tel:')===0)goal('phone_click',{href,text,page:location.href,page_path:location.pathname});
      if(a.dataset&&a.dataset.service){e.preventDefault();applyServicePreset({service:a.dataset.service,text:'Услуга выбрана кнопкой: '+a.dataset.service},true)}
      if(a.dataset&&a.dataset.scenario){e.preventDefault();applyScenario(a.dataset.scenario,true)}
      if(/\.html($|#|\?)/.test(href))goal('service_page_click',{href,text,page:location.href,page_path:location.pathname});
    });
  }

  function init(){
    campaignAttribution();
    loadMetrika();
    initClicks();
    document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount);
    const s=qs().scenario;
    if(s)applyScenario(s,false);else applyServicePreset(currentPreset(),false);
    injectCommunityPrices();
    injectMobileStickyCta();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
