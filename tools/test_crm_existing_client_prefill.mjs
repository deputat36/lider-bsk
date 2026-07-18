import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sourcePath = new URL('../crm/v4/assets/v4/lead-create.js', import.meta.url);
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/^import .*;\n/gm, '')
  .concat('\nglobalThis.__leadCreateTestApi = { CLIENT_FIELDS, CLIENT_LIMIT, bootManualLead, loadExistingClients, applyExistingClient, leadPayload, resetForm };\n');

const elementListeners = new Map();
const documentListeners = new Map();
const elements = {
  manualLeadBox: {
    open: false,
    addEventListener(type, listener) {
      elementListeners.set(type, listener);
    },
  },
  manualLeadExistingClient: { value: '', innerHTML: '', disabled: true },
  refreshManualLeadClientsBtn: { disabled: false },
  manualLeadClientHint: { textContent: '', dataset: {} },
  manualLeadName: { value: '' },
  manualLeadPhone: { value: '' },
  manualLeadSource: { value: 'Вручную' },
  manualLeadService: { value: '' },
  manualLeadCity: { value: 'Борисоглебск' },
  manualLeadContact: { value: 'MAX' },
  manualLeadBudget: { value: '' },
  manualLeadQuality: { value: 'Не оценена' },
  manualLeadNextContact: { value: '' },
  manualLeadMessage: { value: '' },
};

const queryLog = [];
let queryError = null;
const clients = [
  { id: 'client-1', name: 'Бормаш Пески', phone: '+7 900 100-20-30', source: null },
  { id: 'client-2', name: 'Этажи <Борисоглебск>', phone: null, source: null },
];

const supabaseClient = {
  from(table) {
    const query = { table };
    queryLog.push(query);
    return {
      select(fields) {
        query.fields = fields;
        return {
          order(column, options) {
            query.order = { column, options };
            return {
              async limit(limit) {
                query.limit = limit;
                return { data: queryError ? null : clients, error: queryError };
              },
            };
          },
        };
      },
    };
  },
};

const context = {
  console,
  Date,
  Map,
  setTimeout,
  clearTimeout,
  __deps: {
    supabaseClient,
    timeout: async (value) => await value,
    friendlyError: (error) => error?.message || String(error),
    v4State: { crmReady: true, user: { id: 'user-1', email: 'owner@example.test' }, leads: [] },
    setState: () => {},
    byId: (id) => elements[id] || null,
    setStatus: () => {},
    toast: () => {},
    openLeadRoute: () => {},
  },
  document: {
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
  },
};
context.globalThis = context;

const prelude = `
const supabaseClient = globalThis.__deps.supabaseClient;
const timeout = globalThis.__deps.timeout;
const friendlyError = globalThis.__deps.friendlyError;
const v4State = globalThis.__deps.v4State;
const setState = globalThis.__deps.setState;
const byId = globalThis.__deps.byId;
const setStatus = globalThis.__deps.setStatus;
const toast = globalThis.__deps.toast;
const openLeadRoute = globalThis.__deps.openLeadRoute;
`;

vm.runInNewContext(prelude + source, context, { filename: 'lead-create.runtime-test.js' });
const api = context.__leadCreateTestApi;

api.bootManualLead();
assert.equal(queryLog.length, 0, 'closed manual form must not load clients during CRM startup');
assert.equal(typeof elementListeners.get('toggle'), 'function', 'client list must be bound to the form toggle');

elements.manualLeadBox.open = true;
await elementListeners.get('toggle')();

assert.equal(queryLog.length, 1, 'opening the form must load clients once');
assert.equal(queryLog[0].table, 'leader_clients');
assert.equal(queryLog[0].fields, 'id,name,phone,source', 'client lookup must request only minimal fields');
assert.equal(queryLog[0].order.column, 'name');
assert.equal(queryLog[0].order.options.ascending, true);
assert.equal(queryLog[0].limit, 200);
assert.equal(elements.manualLeadExistingClient.disabled, false);
assert.match(elements.manualLeadExistingClient.innerHTML, /Бормаш Пески/);
assert.match(elements.manualLeadExistingClient.innerHTML, /Этажи &lt;Борисоглебск&gt;/, 'client labels must be escaped');

elements.manualLeadExistingClient.value = 'client-1';
api.applyExistingClient('client-1');
assert.equal(elements.manualLeadName.value, 'Бормаш Пески');
assert.equal(elements.manualLeadPhone.value, '+7 900 100-20-30');
assert.equal(elements.manualLeadSource.value, 'Повторный клиент');

elements.manualLeadService.value = 'Баннер';
elements.manualLeadMessage.value = 'Уточнить размер и срок';
const linkedPayload = api.leadPayload();
assert.equal(linkedPayload.converted_client_id, 'client-1', 'new lead must keep the selected client link');
assert.equal(linkedPayload.payload.existing_client_id, 'client-1');
assert.equal(linkedPayload.name, 'Бормаш Пески');

await api.loadExistingClients(false);
assert.equal(queryLog.length, 1, 'cached client list must not issue a duplicate read');
await api.loadExistingClients(true);
assert.equal(queryLog.length, 2, 'manual refresh must issue exactly one new read');

queryError = new Error('relation leader_clients does not exist');
await api.loadExistingClients(true);
assert.equal(queryLog.length, 3);
assert.equal(elements.manualLeadExistingClient.disabled, false, 'a refresh error must keep the previously loaded client list usable');
assert.match(elements.manualLeadClientHint.textContent, /Заявку можно заполнить вручную/);

api.resetForm();
assert.equal(elements.manualLeadExistingClient.value, '');
assert.match(elements.manualLeadClientHint.textContent, /Новый клиент/);
assert.equal(elements.manualLeadCity.value, 'Борисоглебск', 'form reset must restore the default city');

console.log('CRM existing-client prefill behavior is valid: lazy read, minimal fields, safe escaping, linkage and cache.');
