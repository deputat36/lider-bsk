import assert from 'node:assert/strict';
import { setState, subscribeState, v4State } from '../crm/v4/assets/v4/state.js';

let healthyCalls = 0;
const originalError = console.error;
const errors = [];
console.error = (...args) => errors.push(args);

const unsubscribeBroken = subscribeState(() => {
  throw new Error('synthetic subscriber failure');
});
const unsubscribeHealthy = subscribeState((state) => {
  assert.equal(state.status, 'subscriber-isolation-check');
  healthyCalls += 1;
});

try {
  assert.doesNotThrow(() => setState({ status: 'subscriber-isolation-check' }));
  assert.equal(v4State.status, 'subscriber-isolation-check');
  assert.equal(healthyCalls, 1);
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][0]), /state subscriber failed/);
  console.log('CRM state subscriber isolation: PASS');
} finally {
  unsubscribeBroken();
  unsubscribeHealthy();
  console.error = originalError;
}
