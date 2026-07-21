import assert from 'node:assert/strict';
import {
  activeNeeds,
  duplicateNeedGroups,
  findDuplicateNeed,
  needArchiveDecision,
  needDraftFromRecord,
  needDuplicateMeta,
  needDuplicateSummary,
  needFingerprint,
  needFormPresentation
} from '../crm/v4/assets/v4/need-workspace-model-v1.js';

const banner = {
  id: 'need-1',
  lead_id: 'lead-1',
  need_type: 'Баннер',
  title: 'Баннер 3×2',
  description: '  Люверсы   по периметру ',
  structured_data: {
    width: '3 м',
    height: '2 м',
    quantity: '1 шт',
    material: 'Баннер 440 г',
    installation_address: ''
  },
  need_design: true,
  need_installation: false,
  design_reason: 'Макета нет',
  deadline_text: 'до пятницы',
  status: 'Черновик',
  created_at: '2026-07-01T10:00:00Z'
};

const sameBanner = {
  ...banner,
  id: 'need-2',
  title: ' баннер 3×2 ',
  description: 'люверсы по периметру',
  structured_data: { ...banner.structured_data, material: 'баннер 440 г' },
  created_at: '2026-07-01T10:00:09Z'
};

const thirdBanner = {
  ...sameBanner,
  id: 'need-3',
  created_at: '2026-07-01T10:00:10Z'
};

assert.equal(needFingerprint(banner), needFingerprint(sameBanner), 'fingerprint must ignore case and repeated whitespace');
assert.equal(findDuplicateNeed(sameBanner, [banner])?.id, 'need-1', 'same active need must be detected');
assert.equal(findDuplicateNeed(sameBanner, [banner], 'need-1'), null, 'edited record must be excluded from duplicate check');
assert.equal(findDuplicateNeed(sameBanner, [{ ...banner, status: 'Архив' }]), null, 'archived need must not block a new active need');
assert.deepEqual(activeNeeds([banner, { ...banner, id: 'need-archived', status: 'Архив' }]).map((need) => need.id), ['need-1']);

assert.equal(duplicateNeedGroups([banner]).length, 0, 'one active record is not a duplicate group');
const duplicateGroup = duplicateNeedGroups([thirdBanner, banner, sameBanner]);
assert.equal(duplicateGroup.length, 1, 'three exact active records form one duplicate group');
assert.equal(duplicateGroup[0].rowCount, 3);
assert.equal(duplicateGroup[0].extraCount, 2);
assert.equal(duplicateGroup[0].keeperId, 'need-1', 'oldest record is keeper without dependencies');
assert.deepEqual(duplicateGroup[0].duplicateIds, ['need-2', 'need-3']);
assert.equal(needDuplicateSummary([banner, sameBanner, thirdBanner]).extraRecordCount, 2);
assert.equal(needDuplicateMeta('need-2', [banner, sameBanner, thirdBanner]).isKeeper, false);
assert.equal(duplicateNeedGroups([banner, { ...sameBanner, status: 'Архив' }]).length, 0, 'archived duplicate is excluded');

const calculation = {
  id: 'calc-1',
  need_id: 'need-2',
  is_current_revision: true,
  commercial_offer_id: 'offer-1',
  order_id: 'order-1'
};
const linkedGroup = duplicateNeedGroups([banner, sameBanner, thirdBanner], [calculation]);
assert.equal(linkedGroup[0].keeperId, 'need-2', 'record with dependencies becomes keeper even when created later');
assert.equal(linkedGroup[0].linkedCalculationCount, 1);
assert.equal(linkedGroup[0].linkedOfferCount, 1);
assert.equal(linkedGroup[0].linkedOrderCount, 1);

const keeperDecision = needArchiveDecision(banner, [banner, sameBanner, thirdBanner], []);
assert.equal(keeperDecision.allowed, false);
assert.equal(keeperDecision.code, 'keeper');

const duplicateDecision = needArchiveDecision(sameBanner, [banner, sameBanner, thirdBanner], []);
assert.equal(duplicateDecision.allowed, true);
assert.equal(duplicateDecision.code, 'duplicate');
assert.match(duplicateDecision.confirmMessage, /Основная запись останется активной/);

const linkedDecision = needArchiveDecision(sameBanner, [banner, sameBanner, thirdBanner], [calculation]);
assert.equal(linkedDecision.allowed, false);
assert.equal(linkedDecision.code, 'linked');
assert.equal(linkedDecision.calculationCount, 1);
assert.equal(linkedDecision.offerLinkCount, 1);
assert.equal(linkedDecision.orderLinkCount, 1);

const regularDecision = needArchiveDecision({ ...banner, id: 'regular', title: 'Другая потребность' }, [{ ...banner, id: 'regular', title: 'Другая потребность' }], []);
assert.equal(regularDecision.allowed, true);
assert.equal(regularDecision.code, 'regular');

assert.deepEqual(needDraftFromRecord(banner), {
  needType: 'Баннер',
  title: 'Баннер 3×2',
  quantity: '1 шт',
  deadline: 'до пятницы',
  description: '  Люверсы   по периметру ',
  width: '3 м',
  height: '2 м',
  printRun: '',
  material: 'Баннер 440 г',
  needDesign: true,
  needInstallation: false,
  designReason: 'Макета нет',
  installAddress: '',
  installationReason: ''
});

assert.equal(needFormPresentation('create').submitLabel, 'Сохранить потребность');
assert.equal(needFormPresentation('edit').submitLabel, 'Сохранить изменения');
assert.equal(needFormPresentation('copy').submitLabel, 'Сохранить копию');

console.log('Need workspace model behavior and duplicate archive decisions are valid.');
