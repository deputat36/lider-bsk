import assert from 'node:assert/strict';
import {
  buildFirstContactDraft,
  buildFirstContactQuestions,
  firstContactGreeting,
  firstContactServiceProfile
} from '../crm/v4/assets/v4/lead-first-contact-model-v1.js';

assert.equal(firstContactGreeting('Иван Петров'), 'Здравствуйте, Иван!');
assert.equal(firstContactGreeting('ООО Ромашка'), 'Здравствуйте!');
assert.equal(firstContactGreeting('<script>'), 'Здравствуйте!');

const banner = firstContactServiceProfile('Срочная печать баннера');
assert.equal(banner.label, 'баннеру');
assert.match(banner.questions.join(' '), /размер/i);
assert.match(banner.questions.join(' '), /люверсы/i);

const sign = buildFirstContactDraft({ name: 'Анна', service: 'Вывеска для магазина' });
assert.match(sign, /^Здравствуйте, Анна!/);
assert.match(sign, /вывеске или табличке/);
assert.match(sign, /подсветка/i);

const car = buildFirstContactQuestions({ service: 'Наклейки на автомобиль' });
assert.match(car, /марка и модель автомобиля/i);
assert.match(car, /кузова/i);

const posters = firstContactServiceProfile('Афиши и наклейки');
assert.equal(posters.label, 'печатной продукции');
assert.match(posters.questions.join(' '), /тираж/i);

const genericLead = { name: 'Павел', service: 'Нестандартная рекламная задача' };
const before = JSON.stringify(genericLead);
const generic = buildFirstContactDraft(genericLead);
assert.equal(JSON.stringify(genericLead), before, 'Pure model must not mutate the lead');
assert.match(generic, /задаче «Нестандартная рекламная задача»/);
assert.match(generic, /Можно ответить одним сообщением/);
assert.equal((generic.match(/^— /gm) || []).length, 4);

const empty = buildFirstContactDraft({});
assert.match(empty, /^Здравствуйте!/);
assert.match(empty, /вашей задаче/);
assert.ok(!empty.includes('undefined'));

console.log('CRM lead first-contact draft behavior is valid.');
