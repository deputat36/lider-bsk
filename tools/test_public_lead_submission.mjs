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
function page(search = '', sessionStorage = storage) {
  const sent = [];
  const fields = { phone: '+7 900 000-00-00', name: 'Synthetic local test', service: 'Наклейки', message: 'Тестовый расчёт', website: '' };
  const button = {};
  const status = {};
  const offerNote = {};
  const budgetNote = {};
  const form = { dataset: {}, reset() {}, querySelector(selector) {
    if (selector === 'button[type="submit"]') return button;
    if (selector === '[data-leader-lead-status]') return status;
    if (selector === '[data-leader-offer-note]') return offerNote;
    if (selector === '[data-leader-message-budget]') return budgetNote;
    const name = selector.match(/^\[name="([^"]+)"\]$/)?.[1];
    return name ? { get value() { return fields[name] || ''; }, set value(value) { fields[name] = value; } } : null;
  } };
  let networkFailure = false;
  const context = vm.createContext({
    window: { sessionStorage, dispatchEvent() {} },
    document: { readyState: 'loading', title: 'Наклейки', addEventListener() {}, querySelectorAll(selector) { return selector === '[data-leader-lead-widget]' ? [form] : []; } },
    location: { pathname: '/nakleyki-plotternaya-rezka-borisoglebsk.html', href: 'https://www.lider-bsk.ru/nakleyki-plotternaya-rezka-borisoglebsk.html' + search, search },
    navigator: { userAgent: 'local-contract-test' },
    URLSearchParams, CustomEvent: class {}, console: { error() {} },
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body); sent.push(payload);
      if (networkFailure) throw new Error('Synthetic network failure');
      return { ok: true, status: 200, json: async () => ({ ok: true, request_id: payload.request_id }) };
    },
  });
  vm.runInContext(fs.readFileSync('assets/leader-service-catalog.js', 'utf8'), context);
  context.window.LeaderServiceCatalog = context.LeaderServiceCatalog;
  const marker = source.lastIndexOf('})();');
  const instrumented = source.slice(0, marker) + '\nwindow.testSubmit=submit; window.testApplyPreset=()=>applyServicePreset(currentPreset(),false); window.testAttribution=typeof campaignAttribution === "function" ? campaignAttribution : qs; window.testMessage=()=>messageForSubmission(formForTest); window.testBudget=()=>updateMessageBudget(formForTest);\n' + source.slice(marker);
  context.formForTest=form;
  vm.runInContext(instrumented, context);
  return { sent, fields, status, offerNote, budgetNote, message: () => context.window.testMessage(), budget: () => context.window.testBudget(), applyPreset: () => context.window.testApplyPreset(), capture: () => context.window.testAttribution(), fail: value => { networkFailure = value; }, submit: () => context.window.testSubmit({ preventDefault() {}, currentTarget: form }) };
}

const direct = page();
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
