import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual submit handler. All HTTP is intercepted; no backend is used.
const source = fs.readFileSync(process.argv[2] || 'assets/public-lead-form.js', 'utf8');
const values = new Map();
const storage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
function page(search = '', sessionStorage = storage, response = null) {
  const sent = [];
  const goals = [];
  const metrika = [];
  const fields = { phone: '+7 900 000-00-00', name: 'Synthetic local test', service: 'Наклейки', message: 'Тестовый расчёт', website: '' };
  const button = {};
  const status = { focused:false, focus() { this.focused=true; }, scrollIntoView() {}, getBoundingClientRect() { return {top:400,bottom:500,height:100}; } };
  const offerNote = {};
  const budgetNote = {};
  const detailPanel = { removeAttribute() {} };
  const more = { setAttribute() {} };
  const elements = new Map();
  const form = { dataset: {}, reset() {}, querySelector(selector) {
    if (selector === 'button[type="submit"]') return button;
    if (selector === '[data-leader-lead-status]') return status;
    if (selector === '[data-leader-offer-note]') return offerNote;
    if (selector === '[data-leader-message-budget]') return budgetNote;
    if (selector === '[data-leader-details]') return detailPanel;
    if (selector === '[data-leader-more]') return more;
    const name = selector.match(/^\[name="([^"]+)"\]$/)?.[1];
    if (!name) return null;
    if (!elements.has(name)) elements.set(name, { id:'test-'+name, get value() { return fields[name] || ''; }, set value(value) { fields[name] = value; }, validity:{typeMismatch:false}, setCustomValidity() {}, setAttribute() {}, closest() { return null; }, focus() {} });
    return elements.get(name);
  } };
  let networkFailure = false;
  const context = vm.createContext({
    window: { sessionStorage, innerHeight:900, ym(...args) { metrika.push(args); }, dispatchEvent(event) { goals.push(event.detail); } },
    document: { readyState: 'loading', title: 'Наклейки', addEventListener() {}, querySelectorAll(selector) { return selector === '[data-leader-lead-widget]' ? [form] : []; } },
    location: { pathname: '/nakleyki-plotternaya-rezka-borisoglebsk.html', href: 'https://www.lider-bsk.ru/nakleyki-plotternaya-rezka-borisoglebsk.html' + search, search },
    navigator: { userAgent: 'local-contract-test' },
    URL, URLSearchParams, CustomEvent: class { constructor(name,options) { this.detail=options.detail; } }, console: { error() {} },
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body); sent.push(payload);
      if (networkFailure) throw new Error('Synthetic network failure');
      return { ok: true, status: 200, json: async () => response || ({ ok: true, request_id: payload.request_id }) };
    },
  });
  vm.runInContext(fs.readFileSync('assets/leader-service-catalog.js', 'utf8'), context);
  context.window.LeaderServiceCatalog = context.LeaderServiceCatalog;
  const marker = source.lastIndexOf('})();');
  const instrumented = source.slice(0, marker) + '\nwindow.testSubmit=submit; window.testApplyPreset=()=>applyServicePreset(currentPreset(),false); window.testAttribution=typeof campaignAttribution === "function" ? campaignAttribution : qs; window.testMessage=()=>messageForSubmission(formForTest); window.testBudget=()=>updateMessageBudget(formForTest); window.testContact=()=>applyContactMode(formForTest);\n' + source.slice(marker);
  context.formForTest=form;
  vm.runInContext(instrumented, context);
  return { sent, goals, metrika, fields, form, status, offerNote, budgetNote, reply:value=>{response=value;}, contact:()=>context.window.testContact(), message: () => context.window.testMessage(), budget: () => context.window.testBudget(), applyPreset: () => context.window.testApplyPreset(), capture: () => context.window.testAttribution(), fail: value => { networkFailure = value; }, submit: () => context.window.testSubmit({ preventDefault() {}, currentTarget: form }) };
}

function freshSession(){
  const rows=new Map();
  return {getItem:key=>rows.get(key)||null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
}
function goalCount(client,name){return client.metrika.filter(call=>call[1]==='reachGoal'&&call[2]===name).length;}
const confirmationSession=freshSession();
const confirmation=page('?email=synthetic@example.test',confirmationSession,{ok:true,request_id:'web-confirmation-synthetic'});
confirmation.fields.name='Private synthetic name';confirmation.fields.message='Private synthetic task';
confirmation.fail(true);await confirmation.submit();
assert.equal(goalCount(confirmation,'lead_confirmed'),0,'Network failure is not a conversion');
confirmation.fail(false);confirmation.reply({ok:true,request_id:'web-confirmation-synthetic',duplicate:true});
await confirmation.submit();
assert.equal(goalCount(confirmation,'lead_confirmed'),1,'First acknowledgement after a lost reply still confirms the lead');
assert.equal(goalCount(confirmation,'lead_sent'),0,'An existing server record is not a new lead');
await confirmation.submit();
assert.equal(goalCount(confirmation,'lead_confirmed'),1,'The same accepted reference does not count twice');
const reloaded=page('?email=synthetic@example.test',confirmationSession,{ok:true,request_id:'web-confirmation-synthetic',duplicate:true});
await reloaded.submit();
assert.equal(goalCount(reloaded,'lead_confirmed'),0,'Confirmation deduplication survives page navigation');
const rejected=page('',freshSession(),{ok:false,request_id:'web-rejected-synthetic'});await rejected.submit();
assert.equal(goalCount(rejected,'lead_confirmed'),0,'HTTP 200 without ok:true is not a conversion');
const honeypotSession=freshSession();
const honeypot=page('',honeypotSession,{ok:true,request_id:'web-honeypot-synthetic'});
honeypot.fields.website='synthetic-spam.example';await honeypot.submit();
for(const goal of ['lead_confirmed','lead_sent','lead_duplicate'])assert.equal(goalCount(honeypot,goal),0,'A silent honeypot acknowledgement is not a CRM lead');
assert.equal(honeypotSession.getItem('leader_public_lead_confirmed_v1'),null,'A discarded honeypot response does not consume a confirmation');
const analytics=JSON.stringify(confirmation.metrika);
for(const privateValue of ['synthetic@example.test','Private synthetic name','Private synthetic task','web-confirmation-synthetic','request_id','page":'])assert.ok(!analytics.includes(privateValue),'Do not transmit customer data, URL queries or request references: '+privateValue);
assert.ok(confirmation.metrika.every(call=>call[0]===109387236),'Use the existing counter');

for(const duplicate of [false,true]){
  const accepted=page('',storage,{ok:true,request_id:'web-server-confirmed',duplicate});
  accepted.fail(true);await accepted.submit();
  assert.equal(accepted.status.focused,false,'A failed request never focuses a success confirmation');
  assert.ok(accepted.status.className.includes('err'));
  accepted.fail(false);await accepted.submit();
  assert.equal(accepted.sent[0].request_id,accepted.sent[1].request_id,'Confirmation preserves the retry contract');
  assert.equal(accepted.form.dataset.lastRequestId,'web-server-confirmed','Keep the reference returned by the server');
  assert.ok(accepted.status.textContent.startsWith(duplicate?'Заявка уже была отправлена ранее.':'Заявка отправлена.'));
  assert.ok(accepted.status.textContent.includes('Номер обращения: web-server-confirmed.'));
  assert.equal(accepted.status.focused,true,'Successful and previously accepted requests focus their confirmation');
  assert.equal(accepted.goals.at(-1).params.request_id,'web-server-confirmed');
  assert.equal(accepted.goals.at(-1).params.duplicate,duplicate);
  assert.equal(values.has('leader_public_lead_pending_v1'),false);
}
const direct = page();
for(const [method,detail] of [['Написать на email','synthetic@example.test'],['Написать ВКонтакте','vk.com/id123']]){
  const missing=page('?service=visualization-3d&offer=onsite-preview');missing.applyPreset();
  Object.assign(missing.fields,{message:'Сохранить описание и контакт',contact_method:method,contact_detail:'   ',brief_0:'Фасад, фото передам при обсуждении'});
  const before={...missing.fields},pending=values.get('leader_public_lead_pending_v1');
  await missing.submit();
  assert.equal(missing.sent.length,0,'Missing contact blocks the actual handler before HTTP');
  assert.equal(values.get('leader_public_lead_pending_v1'),pending,'Invalid contact does not allocate a request ID');
  assert.deepEqual(missing.fields,before,'Preserve task, selected offer and brief on a contact error');
  assert.equal(missing.goals.at(-1).goal,'contact_detail_missing');
  assert.deepEqual(Object.keys(missing.goals.at(-1).params).sort(),['contact_method','page_path'],'Contact validation analytics contains no customer data or URL query');
  missing.fields.contact_detail=detail;missing.contact();
  assert.equal(missing.status.textContent,'','Correction clears its own error');
  missing.fail(true);await missing.submit();missing.fail(false);await missing.submit();
  assert.equal(missing.sent.length,2);assert.equal(missing.sent[0].request_id,missing.sent[1].request_id);
  assert.equal(missing.sent[1].contact_detail,detail);assert.equal(missing.sent[1].contact_method,method);
  assert.ok(missing.sent[1].message.includes('Состав заказа: Увидеть на объекте'));
  assert.ok(missing.sent[1].message.includes(before.message));assert.ok(missing.sent[1].message.includes(before.brief_0));
  assert.ok(!JSON.stringify(missing.goals).includes(detail),'Analytics does not include the email or profile');
}
for(const detail of ['https://vk.com/id123','vk.com/user_name','https://vk.ru/club123','https://m.vk.com/id123?ref=test','https://www.vk.com/public123']){
  const valid=page();Object.assign(valid.fields,{contact_method:'Написать ВКонтакте',contact_detail:detail});
  await valid.submit();assert.equal(valid.sent.length,1,detail);assert.equal(valid.sent[0].contact_detail,detail);
}
for(const detail of ['not-a-link','https://vk.com/','https://vk.com.evil.example/id123','https://evil.example/?next=https://vk.com/id123','https://user:password@vk.com/id123','https://vk.com:9443/id123','javascript:alert(1)']){
  const invalid=page();Object.assign(invalid.fields,{contact_method:'Написать ВКонтакте',contact_detail:detail});
  const pending=values.get('leader_public_lead_pending_v1');await invalid.submit();
  assert.equal(invalid.sent.length,0,detail);assert.equal(values.get('leader_public_lead_pending_v1'),pending);
  assert.ok(invalid.status.textContent.includes('ссылку на страницу ВКонтакте'));
}
for(const method of ['Позвонить по указанному номеру','Написать в MAX по указанному номеру','Любой удобный способ']){
  const optional=page();optional.fields.contact_method='Написать ВКонтакте';await optional.submit();
  assert.equal(optional.sent.length,0);optional.fields.contact_method=method;optional.contact();
  assert.equal(optional.status.textContent,'');await optional.submit();assert.equal(optional.sent.length,1,method);
}
const contactThenPhone=page();contactThenPhone.fields.contact_method='Написать ВКонтакте';await contactThenPhone.submit();
contactThenPhone.fields.phone='';await contactThenPhone.submit();const currentPhoneError=contactThenPhone.status.textContent;
contactThenPhone.fields.contact_detail='vk.com/id123';contactThenPhone.contact();
assert.equal(contactThenPhone.status.textContent,currentPhoneError,'Contact correction preserves a newer phone error');
await direct.submit();
assert.equal(direct.sent[0].service, 'Наклейки', 'Selected service must survive an URL without service');
assert.equal(direct.sent[0].source, 'Сайт');
assert.equal(direct.sent[0].direction, 'production');
assert.equal(direct.sent[0].service_id, 'stickers');
assert.ok(direct.sent[0].message.includes('Направление: Производство рекламы'));
assert.equal(direct.sent[0].page_path, '/nakleyki-plotternaya-rezka-borisoglebsk.html');
assert.ok(direct.sent[0].message.includes('Услуга: Наклейки'));
assert.ok(direct.sent[0].submitted_at);
for (const [id,service,label] of [
  ['layout-approval','design','Макет на согласование'],
  ['onsite-preview','visualization-3d','Увидеть на объекте'],
  ['launch-kit','campaign','Подготовить запуск'],
]) {
  const selected = page(`?service=${service}&offer=${id}`);
  selected.applyPreset();
  assert.equal(selected.fields.message,'Тестовый расчёт','Selecting a package preserves customer text');
  assert.equal(selected.offerNote.hidden,false);
  assert.ok(selected.offerNote.textContent.includes(label));
  selected.fields.message='x'.repeat(2000);
  for(let i=0;i<4;i++)selected.fields['brief_'+i]=`Offer answer ${i} `+'z'.repeat(120);
  selected.fail(true); await selected.submit();
  selected.fail(false); await selected.submit();
  assert.equal(selected.sent[0].request_id,selected.sent[1].request_id,'Offer retry keeps its request ID');
  assert.ok(selected.sent[1].message.includes('Состав заказа: '+label));
  assert.ok(selected.sent[1].message.includes('Задача клиента: '+'x'.repeat(2000)), 'Keep the full customer task alongside the package and brief');
  assert.ok(selected.sent[1].message.length<=3000);
  if(service!=='campaign')for(let i=0;i<4;i++)assert.ok(selected.sent[1].message.includes(`Offer answer ${i} `+'z'.repeat(120)),'Keep package and all brief answers within budget');
  selected.fields.service='Полиграфия';
  await selected.submit();
  assert.ok(!selected.sent.at(-1).message.includes('Состав заказа:'),'Do not submit an offer for a different service');
}
for (const query of ['?service=design&offer=onsite-preview','?service=design&offer=unknown','?service=design&offer=%3Cscript%3E']) {
  const invalid=page(query); invalid.applyPreset(); await invalid.submit();
  assert.equal(invalid.offerNote.hidden,true);
  assert.ok(!invalid.sent[0].message.includes('Состав заказа:'),'Ignore unknown or incompatible offers');
}
const changed = page('?service=Баннер&utm_source=vk&utm_campaign=opening');
const creative = page();
creative.fields.service = '3D-визуализация';
creative.fields.message = 'x'.repeat(2000);
for (let i=0;i<4;i++) creative.fields['brief_'+i] = `Параметр ${i} `+'z'.repeat(120);
creative.fail(true);
await creative.submit();
creative.fail(false);
await creative.submit();
assert.equal(creative.sent[0].request_id,creative.sent[1].request_id,'Creative brief retry reuses the same request');
assert.equal(creative.sent[1].service_id,'visualization-3d');
assert.ok(creative.sent[1].message.length<=3000);
assert.ok(creative.sent[1].message.includes('Задача клиента: '+'x'.repeat(2000)),'Never clip the end of a long customer task');
for (let i=0;i<4;i++) assert.ok(creative.sent[1].message.includes(`Параметр ${i} `+'z'.repeat(120)),'Keep all brief answers within intake message budget');

for(const service of ['Дизайн макета','3D-визуализация','3D-моделирование','3D-анимация и моушн-дизайн','Подготовка макетов к печати и ретушь']){
  const long=page();long.fields.service=service;
  long.fields.message='Полное ТЗ '+ 'т'.repeat(1988)+'🔶';
  assert.equal(long.fields.message.length,2000);
  for(let i=0;i<4;i++)long.fields['brief_'+i]='Ответ '+i+' '+ 'б'.repeat(172);
  const before={...long.fields};const pendingBefore=values.get('leader_public_lead_pending_v1');
  const excess=long.budget()-3000;assert.ok(excess>0,service);
  assert.equal(long.budgetNote.hidden,false);
  assert.ok(long.budgetNote.textContent.includes('на '+excess+' символ'));
  await long.submit();
  assert.equal(long.sent.length,0,'An overlong message never reaches HTTP or allocates a request ID');
  assert.equal(values.get('leader_public_lead_pending_v1'),pendingBefore);
  assert.deepEqual(long.fields,before,'Validation preserves every entered field');
  assert.ok(long.status.textContent.includes('на '+excess+' символ'));
  long.fields.message=long.fields.message.slice(0,1999-excess);
  long.budget();assert.equal(long.status.textContent,'','Correcting the text clears only the length error');
  assert.equal(long.message().length,2999);
  long.fields.message+='я';assert.equal(long.budget(),3000);
  await long.submit();
  const payload=long.sent.at(-1);
  assert.equal(payload.message.length,3000,'The exact endpoint limit is accepted');
  assert.ok(payload.message.includes('Задача клиента: '+long.fields.message));
  for(let i=0;i<4;i++)assert.ok(payload.message.includes(long.fields['brief_'+i]));
  assert.equal(payload.page_path,'/nakleyki-plotternaya-rezka-borisoglebsk.html');
  assert.equal(payload.page_title,'Наклейки','Compact message keeps attribution in the payload');
  long.fields.message+='я';assert.equal(long.budget(),3001);
  await long.submit();assert.equal(long.sent.length,1,'One extra character is rejected, not truncated');
  assert.ok(long.status.textContent.includes('на 1 символ,'));
}

const contact=page();
Object.assign(contact.fields,{service:'3D-визуализация',message:'Описание '+ 'я'.repeat(1600),city:'Город '+ 'г'.repeat(100),business:'Объект '+ 'о'.repeat(150),contact_method:'Написать на email',contact_detail:'a'.repeat(280)+'@example.test',quantity:'Формат '+ 'ф'.repeat(100),deadline:'К определённой дате',mockup:'Есть пример, нужно доработать',delivery:'Нужен монтаж',budget:'Не знаю, нужен расчёт'});
for(let i=0;i<4;i++)contact.fields['brief_'+i]='Параметр '+i+' '+ 'п'.repeat(150);
const contactBefore={...contact.fields};
await contact.submit();assert.equal(contact.sent.length,0);
assert.deepEqual(contact.fields,contactBefore,'Contact details survive validation too');
contact.fields.message='Краткое описание';await contact.submit();
for(const [key,value] of Object.entries(contact.fields).filter(([key])=>key!=='website'&&key!=='name'&&key!=='phone')){
  assert.ok(contact.sent[0].message.includes(value),'Do not clip '+key);
}
assert.equal(contact.sent[0].contact_detail,contactBefore.contact_detail);

const mixedValidation=page();
mixedValidation.fields.service='3D-визуализация';
mixedValidation.fields.message='д'.repeat(2000);
for(let i=0;i<4;i++)mixedValidation.fields['brief_'+i]='б'.repeat(180);
await mixedValidation.submit();assert.equal(mixedValidation.sent.length,0);
mixedValidation.fields.phone='';await mixedValidation.submit();
const phoneError=mixedValidation.status.textContent;
assert.ok(phoneError.includes('Укажите телефон'));
mixedValidation.fields.message='Краткое описание';mixedValidation.budget();
assert.equal(mixedValidation.status.textContent,phoneError,'Correcting length must not clear another current validation error');
await changed.submit();
assert.equal(changed.sent[0].service, 'Наклейки', 'User selection must win over the original link preset');
assert.equal(changed.sent[0].utm_source, 'vk');
const navigated = page();
await navigated.submit();
assert.equal(navigated.sent[0].utm_campaign, 'opening', 'Internal navigation must retain campaign');
const newCampaign = page('?utm_source=yandex');
newCampaign.capture();
const nextPage = page();
await nextPage.submit();
assert.equal(nextPage.sent[0].utm_source, 'yandex');
assert.equal(nextPage.sent[0].utm_campaign, '', 'A new campaign must not inherit old campaign fields');
const initialVisit = page('?utm_source=qr&utm_medium=offline&utm_content=flyer');
initialVisit.capture(); // Arrival must be captured before any form submission.
const fromArrival = page();
fromArrival.fail(true);
await fromArrival.submit();
fromArrival.fail(false);
await fromArrival.submit();
assert.equal(fromArrival.sent[0].request_id, fromArrival.sent[1].request_id, 'Retry must preserve the request ID');
assert.equal(fromArrival.sent[1].utm_content, 'flyer');
assert.ok(!Array.from(values.values()).join('').includes('Synthetic local test'));
assert.ok(!Array.from(values.values()).join('').includes('900 000'));
values.set('leader_public_campaign_v1', JSON.stringify({created_at: Date.now() - 31 * 60 * 1000, values: {utm_source: 'expired'}}));
const expired = page(); await expired.submit();
assert.equal(expired.sent[0].utm_source, '');
values.set('leader_public_campaign_v1', '{invalid json');
const corrupted = page(); await corrupted.submit();
assert.equal(corrupted.sent[0].service, 'Наклейки');
const blocked = page('?utm_source=vk', {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}, removeItem() {throw Error('blocked');}});
await blocked.submit();
assert.equal(blocked.sent[0].utm_source, 'vk');
assert.equal(blocked.sent[0].service, 'Наклейки');
console.log('PASS: actual form submit preserves selected service, campaign navigation, replacement, TTL, storage fallback and retry.');
