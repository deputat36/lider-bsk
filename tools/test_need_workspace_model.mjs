import assert from 'node:assert/strict';
import {
  activeNeeds,
  findDuplicateNeed,
  needDraftFromRecord,
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
  status: 'Черновик'
};

const sameBanner = {
  ...banner,
  id: 'draft-id',
  title: ' баннер 3×2 ',
  description: 'люверсы по периметру',
  structured_data: { ...banner.structured_data, material: 'баннер 440 г' }
};

assert.equal(needFingerprint(banner), needFingerprint(sameBanner), 'fingerprint must ignore case and repeated whitespace');
assert.equal(findDuplicateNeed(sameBanner, [banner])?.id, 'need-1', 'same active need must be detected');
assert.equal(findDuplicateNeed(sameBanner, [banner], 'need-1'), null, 'edited record must be excluded from duplicate check');
assert.equal(findDuplicateNeed(sameBanner, [{ ...banner, status: 'Архив' }]), null, 'archived need must not block a new active need');
assert.deepEqual(activeNeeds([banner, { ...banner, id: 'need-2', status: 'Архив' }]).map((need) => need.id), ['need-1']);

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

console.log('Need workspace model behavior is valid.');
