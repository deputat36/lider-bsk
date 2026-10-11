import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { needCalculationPrefill } from '../crm/v4/assets/v4/need-calculation-prefill-v1.js';
import { creativeNeedDraft } from '../crm/v4/assets/v4/creative-need-draft-v1.js';

// Execute the actual handoff and item builder. No database or HTTP is used.
const source=fs.readFileSync(process.argv[2] || 'crm/v4/assets/v4/calculations.js','utf8');
function actual(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end===-1?source.length:end);
}
function harness(need){
  const fields={calcNeedId:{value:''},calcTitle:{value:''},calcPublicComment:{value:'Условия согласованы вручную'},calculationsBox:{scrollIntoView(){}}};
  const state={route:{leadId:'lead-a'},leadNeeds:[need]};
  let allowed=true,contextNeed=null;
  const context=vm.createContext({
    v4State:state,needCalculationPrefill,CRM_V4_ACTIONS:{NEEDS_READ:'needs.read',CALCULATIONS_WRITE:'calculations.write'},
    canPerformV4Action:()=>allowed,byId:id=>fields[id]||null,
    val:id=>String(fields[id]?.value??'').trim(),num:id=>Number(fields[id]?.value||0),
    esc:value=>String(value??''),applyAutoPrice:rows=>rows,renderSmartPreview(){},toast(){},
    renderCalculationNeedContext(){contextNeed=state.leadNeeds.find(item=>item.id===fields.calcNeedId.value);},
    Option:class {constructor(text,value){this.textContent=text;this.value=value;}}
  });
  context.setCalcMode=mode=>{
    for(const id of Object.keys(fields))if(!['calcNeedId','calcTitle','calcPublicComment','calculationsBox'].includes(id))delete fields[id];
    fields.calcSmartMode={value:mode};
    const html=context.renderModeFields(mode);
    for(const match of html.matchAll(/<(input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
      const [tag,type,id]=match;
      fields[id]={value:tag.match(/\bvalue="([^"]*)"/)?.[1]||''};
      if(type==='select'){
        const options=html.slice(match.index+tag.length).split('</select>')[0];
        fields[id].options=[...options.matchAll(/<option(?:\s+value="([^"]*)")?[^>]*>([^<]*)<\/option>/g)].map(item=>({value:item[1]??item[2]}));
        fields[id].value=fields[id].options[0]?.value||'';
        fields[id].add=option=>fields[id].options.push(option);
      }
    }
  };
  vm.runInContext([actual('renderModeFields'),actual('makeRawItem'),actual('currentModeItems'),actual('applyNeedToCalculation')].join('\n'),context);
  return {fields,state,apply:value=>context.applyNeedToCalculation(value),items:()=>context.currentModeItems(),allow:value=>{allowed=value;},contextNeed:()=>contextNeed};
}
for(const id of ['design','modeling-3d','visualization-3d','animation','prepress']){
  const service=globalThis.LeaderServiceCatalog.find(id);
  const lead={id:'lead-a',service:service.label,message:'Источник: сайт РА Лидер\nЗадача клиента: Точное описание\nКонтакт для выбранного способа: synthetic@example.test\nБриф — '+service.questions[0]+' Ответ клиента'};
  const draft=creativeNeedDraft(lead,'lead-a');
  const need={id:'need-'+id,lead_id:lead.id,need_type:draft.needType,title:draft.title,description:draft.description,structured_data:{quantity:'4 шт'},status:'Новая'};
  const run=harness(need);run.apply({...need,title:'Подменённое название из события'});
  assert.equal(run.fields.calcServiceName.value,service.label,'Exact service title reaches the billable item');
  assert.equal(run.fields.calcServiceQty.value,'4','Service quantity reaches its actual control');
  assert.equal(run.fields.calcNeedId.value,need.id);
  assert.equal(run.fields.calcTitle.value,service.label,'Use the currently loaded need, not event text');
  assert.equal(run.fields.calcPublicComment.value,'Условия согласованы вручную','Internal brief never replaces client conditions');
  assert.equal(run.contextNeed().description,lead.message,'Keep the full brief for internal review');
  run.fields.calcServiceCost.value='100';run.fields.calcServiceClient.value='200';
  const item=run.items()[0];assert.equal(item.name,service.label);assert.equal(item.qty,4);assert.equal(item.contractor_price,100);assert.equal(item.client_price,200);
  run.fields.calcServiceClient.value='0';assert.equal(run.items()[0].data.price_source,'manual','Explicit free service remains an explicit manual price');
  run.fields.calcServiceQty.value='0';assert.equal(run.items()[0].qty,0,'Invalid zero quantity is not silently changed to one');
}
const custom={id:'need-custom',lead_id:'lead-a',need_type:'Вывеска',title:'Входная группа по чертежу',description:'Внутренний бриф',structured_data:{quantity:'2,5'},status:'Новая'};
const run=harness(custom);run.apply(custom);
assert.equal(run.fields.calcCustomName.value,custom.title);assert.equal(run.fields.calcCustomQty.value,'2.5');assert.equal(run.items()[0].name,custom.title);assert.equal(run.items()[0].qty,2.5);
const before=JSON.stringify(run.fields);
run.apply({...custom,id:'missing'});assert.equal(JSON.stringify(run.fields),before);
run.state.route.leadId='other-lead';run.apply(custom);assert.equal(JSON.stringify(run.fields),before,'Foreign lead does not alter a draft');
run.state.route.leadId='lead-a';run.allow(false);run.apply(custom);assert.equal(JSON.stringify(run.fields),before,'Missing permission does not alter a draft');
run.allow(true);custom.status='Архив';run.apply(custom);assert.equal(JSON.stringify(run.fields),before,'Archived need does not alter a draft');
console.log('PASS: actual creative/custom handoff keeps item names, quantity, internal brief and manual client conditions; stale/foreign/archived/permission guards; no backend writes.');
