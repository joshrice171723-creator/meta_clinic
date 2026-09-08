export function register({add,fc,request,assert}) {
  const validation={layer:'ActiveRecord validation'}, service={layer:'application service'};
  for(const [kind,ids,fields] of [['message',[76],['content','requested_at','request_key','identity','patient']],['booking',[22],['starts_at','ends_at','requested_at','identity','patient']]]) {
    add(`portal ${kind} model rejects missing creation input`,ids,fc.constantFrom(...fields),async field=>{
      const r=await request('portal_contract',{operation:'request_model',kind,attributes:{[field]:null}});
      assert.equal(r.valid,false);assert.ok(r.errors.includes(field));
    },validation);
  }
  add('portal change request model requires source appointment snapshot',[89],fc.constantFrom('reschedule','cancel'),async request_kind=>{
    const r=await request('portal_contract',{operation:'request_model',kind:'booking',attributes:{request_kind,starts_at:null,ends_at:null}});
    assert.equal(r.valid,false);for(const f of ['source_appointment','source_appointment_updated_at','source_starts_at','source_ends_at','source_status'])assert.ok(r.errors.includes(f));
  },validation);
  add('portal reviewed request model requires review attribution',[23],fc.constantFrom('approved','declined'),async status=>{
    const r=await request('portal_contract',{operation:'request_model',kind:'booking',attributes:{status}});
    assert.equal(r.valid,false);assert.ok(r.errors.includes('reviewed_at'));assert.ok(r.errors.includes('reviewed_by_membership'));
  },validation);
  add('previsit exact retry creates one version and changed retry conflicts',[32],fc.stringMatching(/^[A-Za-z]{1,40}$/),async text=>{
    const r=await request('portal_contract',{operation:'previsit_retry',text});
    assert.equal(r.same,true);assert.equal(r.replayed,true);assert.equal(r.conflict,true);assert.equal(r.count,1);
  },service);
  add('patient confirmation rejects changed appointment material',[24],fc.integer({min:1,max:240}),async minutes=>{
    const r=await request('portal_contract',{operation:'confirm_stale',minutes});assert.equal(r.rejected,true);assert.equal(r.status,'scheduled');
  },service);
  add('reschedule rejects nonpositive duration without mutation',[25],fc.integer({min:0,max:240}),async minutes=>{
    const r=await request('portal_contract',{operation:'reschedule_invalid',minutes});assert.equal(r.rejected,true);assert.equal(r.unchanged,true);
  },service);
  add('terminal appointment cannot be confirmed again',[24,26,27],fc.constantFrom('cancelled','no_show','completed'),async terminal=>{
    const r=await request('portal_contract',{operation:'terminal_appointment',terminal});assert.equal(r.rejected,true);assert.equal(r.status,terminal);
  },service);
  add('appointment approval rejects missing time or clinic atomically',[23],fc.constantFrom('starts_at','ends_at','site'),async field=>{
    const r=await request('portal_contract',{operation:'approve_missing',field});assert.equal(r.rejected,true);assert.equal(r.status,'pending');assert.equal(r.created,0);
  },service);
  add('appointment decline exact retry preserves one reviewed request',[23],fc.stringMatching(/^[A-Za-z]{1,40}$/),async reason=>{
    const r=await request('portal_contract',{operation:'decline_retry',reason});assert.equal(r.same,true);assert.equal(r.replayed,true);assert.equal(r.status,'declined');assert.equal(r.appointment,null);
  },service);
}
