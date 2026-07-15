import assert from 'node:assert/strict';
import {
  calculationVersionAudit,
  calculationVersionIntegrityCopy,
  calculationVersionState
} from '../crm/v4/assets/v4/calculation-version-integrity-model-v1.js';

{
  const audit = calculationVersionAudit([]);
  assert.equal(audit.calculationCount, 0);
  assert.equal(audit.latestVersion, 0);
  assert.equal(audit.nextVersion, 1);
  assert.deepEqual(audit.duplicateVersions, []);
}

{
  const calculations = [{ version_number: 1 }, { version_number: 3 }];
  const audit = calculationVersionAudit(calculations);
  assert.equal(audit.latestVersion, 3);
  assert.equal(audit.nextVersion, 4);
  assert.equal(audit.hasDuplicates, false);
  const oldState = calculationVersionState(calculations[0], audit);
  assert.equal(oldState.isLatest, false);
  assert.equal(oldState.nextVersion, 4);
}

{
  const calculations = [{ version_number: 1 }, { version_number: 1 }, { version_number: 3 }];
  const audit = calculationVersionAudit(calculations);
  assert.equal(audit.hasDuplicates, true);
  assert.deepEqual(audit.duplicateVersions, [1]);
  const state = calculationVersionState(calculations[0], audit);
  assert.equal(state.isDuplicate, true);
  assert.equal(state.tone, 'error');
  assert.match(state.message, /перенумерование.*запрещено/i);
  const copy = calculationVersionIntegrityCopy(calculations);
  assert.equal(copy.tone, 'error');
  assert.match(copy.message, /не изменяются автоматически/i);
  assert.match(copy.message, /1/);
}

{
  const audit = calculationVersionAudit([{ version_number: 2, commercial_offer_id: 'offer-1' }]);
  const state = calculationVersionState({ version_number: 2, commercial_offer_id: 'offer-1' }, audit);
  assert.equal(state.linkedToOffer, true);
  assert.equal(state.protectedSource, true);
  assert.equal(state.tone, 'warn');
  assert.ok(state.badges.includes('Связано с КП'));
}

{
  const audit = calculationVersionAudit([{ version_number: 4, order_id: 'order-1' }]);
  const state = calculationVersionState({ version_number: 4, order_id: 'order-1' }, audit);
  assert.equal(state.linkedToOrder, true);
  assert.equal(state.protectedSource, true);
  assert.equal(state.tone, 'locked');
  assert.match(state.message, /должны оставаться неизменными/i);
}

{
  const audit = calculationVersionAudit([{ version_number: 2, status: 'Согласован' }]);
  const state = calculationVersionState({ version_number: 2, status: 'Согласован' }, audit);
  assert.equal(state.nonDraft, true);
  assert.equal(state.protectedSource, true);
  assert.equal(state.tone, 'warn');
}

console.log('Calculation version integrity model tests passed.');