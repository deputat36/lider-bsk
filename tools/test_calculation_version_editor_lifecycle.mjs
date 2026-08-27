import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the real observer callback with owned and external DOM mutations.
// No Auth/database fixture is required to reproduce microtask starvation.
const source = readFileSync(new URL('../crm/v4/assets/v4/calculation-version-editor-v1.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
  .replace(/export function /g, 'function ');
const queued = [];
const listeners = [];
const section = {};
const hosts = new Map([['leadCardSection', section]]);
let observerCallback;
let observerCount = 0;
const context = vm.createContext({
  document: {
    querySelector: () => ({}),
    addEventListener: (name) => listeners.push(name)
  },
  byId: (id) => hosts.get(id) || null,
  window: { queueMicrotask: (callback) => queued.push(callback) },
  MutationObserver: class {
    constructor(callback) { observerCallback = callback; observerCount += 1; }
    observe(target) { assert.equal(target, section); }
  }
});
vm.runInContext(source, context);
vm.runInContext('bootCalculationVersionEditor(); bootCalculationVersionEditor();', context);
assert.equal(observerCount, 1, 'repeated lazy boot must not multiply observers');
assert.equal(listeners.filter((name) => name === 'input').length, 1);
assert.equal(queued.length, 1);
queued.shift()();

for (const selector of ['#savedCalculationsWorkspace', '.v4-calc-form']) {
  const owned = { target: { closest: (query) => query.includes(selector) ? {} : null } };
  for (let i = 0; i < 100; i += 1) observerCallback([owned]);
  assert.equal(queued.length, 0, 'editor/preview writes must not requeue layout or reset input focus');
}
const external = { target: { closest: () => null } };
observerCallback([external]);
observerCallback([external]);
assert.equal(queued.length, 1, 'external rendering must reconcile once');
queued.shift()();
observerCallback([{ target: { closest: () => ({}) } }, external]);
assert.equal(queued.length, 1, 'mixed mutation batches must preserve external updates');
queued.shift()();
const legacySnapshot = {};
const currentSnapshot = {};
hosts.set('savedCalculationsSnapshot', legacySnapshot);
assert.equal(vm.runInContext('savedSnapshotHost()', context), legacySnapshot);
hosts.set('savedCalculationsBox', currentSnapshot);
assert.equal(vm.runInContext('savedSnapshotHost()', context), currentSnapshot,
  'version entrypoints must decorate the actual saved calculation cards');
console.log('Calculation version editor lifecycle: PASS (no self-reconciliation, external updates preserved).');
