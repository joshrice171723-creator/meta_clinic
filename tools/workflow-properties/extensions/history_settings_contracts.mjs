export function register({add,fc,request,assert}) {
  const service={layer:'application service'};
  add('prior document download rejects every nonclean scan state',[36],fc.constantFrom('pending','quarantined','rejected'),async state=>{
    const r=await request('history_settings_contract',{operation:'document',state});assert.equal(r.rejected,true);assert.equal(r.error,'This document is not available for download.');assert.equal(r.returned_id,null);assert.equal(r.state,state);
  },service);
  add('prior clean document download returns the authorized document',[36],fc.constant('clean'),async state=>{
    const r=await request('history_settings_contract',{operation:'document',state});assert.equal(r.rejected,false);assert.equal(r.returned_id,r.id);
  },service);
  add('workforce site settings inherit null overrides without mutating practice settings',[8],fc.boolean(),async enabled=>{
    const r=await request('history_settings_contract',{operation:'inheritance',enabled});assert.equal(r.enabled,enabled);assert.equal(r.scanner,true);assert.equal(r.timezone,'America/Chicago');assert.equal(r.practice_version,r.base_id);assert.equal(r.unchanged,true);
  },service);
  add('future workforce settings cannot take effect before their effective time',[8],fc.tuple(fc.boolean(),fc.integer({min:1,max:10080})),async([enabled,minutes])=>{
    const r=await request('history_settings_contract',{operation:'future',enabled,minutes});assert.equal(r.enabled,enabled);assert.equal(r.practice_version,r.base_id);assert.equal(r.unchanged,true);
  },service);
}
