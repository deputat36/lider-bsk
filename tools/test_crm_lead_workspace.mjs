import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../crm/v4/assets/v4/lead-card.js', import.meta.url), 'utf8');
const nodes = Object.fromEntries(['need', 'calculation', 'offer', 'order'].map(key => [key, { textContent: '' }]));
const state = {
  route: { leadId: 'lead-a' }, currentLead: { id: 'lead-a' },
  leadNeeds: [{ lead_id: 'lead-a' }, { lead_id: 'lead-a', status: 'Архив' }, { lead_id: 'lead-b' }],
  calculations: [{ lead_id: 'lead-a', order_id: 'order-a' }, { lead_id: 'lead-b', order_id: 'foreign-order' }],
  offers: [{ lead_id: 'lead-a', order_id: 'order-a' }]
};
const context = vm.createContext({
  v4State: state,
  leadPrimaryAction: () => ({ type: 'open_need', label: 'Потребность', hint: '' }),
  leadResponsibilityState: () => ({ key: 'self', label: 'Вы' }),
  buildFirstContactDraft: () => '',
  document: { readyState: 'loading', addEventListener() {}, querySelector(selector) {
    return nodes[selector.match(/="(.*?)"/)?.[1]];
  } }
});
vm.runInContext(source.replace(/^import .*;\n/gm, '') + '\nthis.api={updateStageCounts,renderLeadDetails,revealWorkTarget};', context);
context.api.updateStageCounts();
assert.equal(nodes.need.textContent, 'Потребностей: 1');
assert.equal(nodes.calculation.textContent, 'Сохранённых версий: 1');
assert.equal(nodes.offer.textContent, 'Предложений: 1');
assert.equal(nodes.order.textContent, 'Связанных заказов: 1', 'foreign links and duplicate order IDs must not inflate summary');
state.calculationsBusy = true;
context.api.updateStageCounts();
assert.equal(nodes.calculation.textContent, 'Загрузка…');
state.calculationsBusy = false;
state.calculationsError = 'unavailable';
context.api.updateStageCounts();
assert.equal(nodes.calculation.textContent, 'Не загрузился — откройте');

const html = context.api.renderLeadDetails({ id: 'lead-a', name: '<script>private</script>', status: 'Новая', message: 'Нужен баннер' });
assert.ok(!html.includes('<script>private</script>'));
assert.ok(html.indexOf('v4-lead-summary') < html.indexOf('leadPrimaryActionHost'));
for (const id of ['needsList', 'needFormBox', 'savedCalculationsBox', 'calculationsBox', 'offersBox', 'ordersBox', 'leadTimelineBox']) {
  assert.equal(html.split(`id="${id}"`).length - 1, 1, `one existing ${id} host`);
}
assert.match(html, /id="leadNeedStage"[^>]* open/);
assert.doesNotMatch(html, /id="leadHistoryDetails"[^>]* open/);
const parent = { tagName: 'DETAILS', open: false };
const child = { tagName: 'DIV', parentElement: parent };
context.api.revealWorkTarget(child);
assert.equal(parent.open, true, 'existing CTAs must reveal their containing stage');
console.log('Lead workspace: isolated counts, preserved hosts and reveal behavior PASS');
