import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { creativeNeedDraft } from '../crm/v4/assets/v4/creative-need-draft-v1.js';
import { activeNeeds, needDraftFromRecord, needFingerprint } from '../crm/v4/assets/v4/need-workspace-model-v1.js';
import { firstContactServiceProfile } from '../crm/v4/assets/v4/lead-first-contact-model-v1.js';

const services = ['design', 'visualization-3d', 'modeling-3d', 'animation', 'prepress'];
const actual = fs.readFileSync('crm/v4/assets/v4/needs.js', 'utf8');
const openFunction = actual.slice(actual.indexOf('function openNeedForm('), actual.indexOf('function closeNeedForm('));
function open(mode, lead, needs = [], record = null, routeId = lead?.id) {
  const context = vm.createContext({
    v4State: { currentLead: lead, leadNeeds: needs, route: {leadId: routeId} },
    activeNeeds, creativeNeedDraft, needDraftFromRecord, needFingerprint,
    createUuid: () => 'local-draft', renderNeeds() {}, focusNeedForm() {}, workspace: null
  });
  vm.runInContext(openFunction+'\nglobalThis.runOpen=openNeedForm;', context);
  context.runOpen(mode, record);
  return context.workspace;
}
for (const id of services) {
  const service = globalThis.LeaderServiceCatalog.find(id);
  const lead = {id:'lead-a', service:service.label, message:'Бриф — '+service.questions[0]+' Ответ клиента'};
  const result = open('create', lead);
  assert.equal(result.seed.title, service.label);
  assert.equal(result.seed.needType, 'Дизайн');
  assert.equal(result.seed.needDesign, true);
  assert.equal(result.seed.needInstallation, false);
  assert.equal(result.seed.description, lead.message);
  assert.equal(firstContactServiceProfile(lead.service).questions.join('|'), service.questions.join('|'));
  assert.equal(open('create', lead, [{id:'existing',status:'Новая'}]).seed, null, 'Only the first need is prefilled');
  assert.equal(open('create', lead, [], null, 'another-lead').seed, null, 'Never copy another lead');
}
const existing = {id:'need-a',lead_id:'lead-a',need_type:'Вывеска',title:'Согласованный вариант',description:'Уже согласовано',status:'Новая'};
const lead = {id:'lead-a',service:'3D-визуализация',message:'Новый текст заявки'};
assert.equal(open('edit', lead, [], existing).seed.description, existing.description);
assert.equal(open('copy', lead, [], existing).seed.title, existing.title);
assert.equal(open('create',{id:'lead-a',service:'Баннер'}).seed, null);
assert.equal(creativeNeedDraft({id:'lead-a',service:'animation',message:'x'.repeat(5000)},'lead-a').description.length,3000);
console.log('PASS: actual first-need opening uses creative lead brief; extra/edit/copy/other-lead drafts remain isolated.');
