import assert from 'node:assert/strict';
import {v4State} from '../crm/v4/assets/v4/state.js';
import {canOpenV4ProductionKind,firstAllowedV4ProductionKind,applyV4TabButtonVisibility,DESIGN_QUEUE_PRODUCTION_ENABLED}from'../crm/v4/assets/v4/role-tab-permissions-v1.js';
v4State.profileLoaded=true;
assert.equal(DESIGN_QUEUE_PRODUCTION_ENABLED,true);
for(const [role,first,label]of [['designer','design','Дизайн'],['contractor','production','Производство'],['installer','installation','Монтаж']]){
 const profile={role,is_active:true};assert.equal(firstAllowedV4ProductionKind(profile),first);assert.equal(canOpenV4ProductionKind('design',profile),role==='designer');
 const button={dataset:{v4TabButton:'production'},setAttribute(){},querySelector(){return null}};applyV4TabButtonVisibility({querySelectorAll:()=>[button]},profile);assert.equal(button.textContent,label);assert.equal(button.hidden,false);
 assert.equal(canOpenV4ProductionKind(first,{...profile,is_active:false}),false);
}
v4State.profileLoaded=false;assert.equal(canOpenV4ProductionKind('design',{role:'designer',is_active:true}),false);
console.log('Worker role kinds, production read activation, navigation labels and inactive/profile gates PASS.');
