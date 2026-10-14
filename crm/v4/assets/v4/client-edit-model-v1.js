export const CLIENT_EDIT_FIELDS=Object.freeze(['name','phone','source','address','comment']);
const text=value=>String(value??'').trim();
export function clientEditChanges(base={},draft={}) {return CLIENT_EDIT_FIELDS.filter(key=>text(base[key])!==text(draft[key]));}
export function reconcileClientEdit(base={},draft={},current={}) {
  const touched=clientEditChanges(base,draft);
  return { values:{...current,...Object.fromEntries(touched.map(key=>[key,text(draft[key])]))}, conflicts:touched.filter(key=>text(current[key])!==text(base[key])&&text(current[key])!==text(draft[key])) };
}
