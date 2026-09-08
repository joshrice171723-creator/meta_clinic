export function register({add,fc,request,assert,blank}) {
  const service={layer:'application service'};
  for(const operation of ['provider_completed','provider_stale','provider_wrong_site']) {
    add(`${operation} rejects assignment without a participant mutation`,[29],fc.stringMatching(/^[1-9][0-9]{0,7}$/),async token=>{
      const r=await request('ui_context_contract',{operation,token});assert.equal(r.rejected,true);assert.equal(r.participants,0);
      assert.equal(r.error_class,operation==='provider_stale'?'ActiveRecord::StaleObjectError':'ArgumentError');
      if(operation==='provider_completed')assert.equal(r.error_message,'A completed encounter cannot be assigned.');
      if(operation==='provider_wrong_site')assert.equal(r.error_message,'The clinician is not assigned to this encounter site.');
    },service);
  }
  add('provider assignment accepts a current clinician at the encounter site',[29],fc.constant(null),async()=>{
    const r=await request('ui_context_contract',{operation:'provider_valid'});assert.equal(r.rejected,false);assert.equal(r.participants,1);
  },service);
  add('staff attachment rejects missing filename or checksum before creation',[78],fc.tuple(fc.constantFrom('filename','checksum'),blank),async([field,value])=>{
    const r=await request('ui_context_contract',{operation:'attachment',attributes:{[field]:value}});assert.equal(r.rejected,true);assert.equal(r.created,0);
  },service);
  add('staff attachment rejects nonpositive or oversized files',[78],fc.oneof(fc.integer({min:-10000,max:0}),fc.integer({min:10485761,max:20000000})),async byte_size=>{
    const r=await request('ui_context_contract',{operation:'attachment',attributes:{byte_size}});assert.equal(r.rejected,true);assert.equal(r.created,0);
  },service);
  add('staff acknowledgement rejects messages without acknowledgement request',[78],fc.string({maxLength:50}),async note=>{
    const r=await request('ui_context_contract',{operation:'ack_unrequired',note});assert.equal(r.rejected,true);assert.equal(r.acknowledged,false);assert.equal(r.message_acknowledged,false);
  },service);
  add('marking staff conversation read does not acknowledge a message',[80],fc.constant(null),async()=>{
    const r=await request('ui_context_contract',{operation:'read_not_ack'});assert.equal(r.read,true);assert.equal(r.acknowledged,false);assert.equal(r.message_acknowledged,false);
  },service);
}
