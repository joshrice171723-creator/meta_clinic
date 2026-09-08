export function register({add,fc,request,assert,blank}) {
  const validation={layer:'ActiveRecord validation'};
  const contracts=[
    ['time_off',[82],['reason','starts_at','ends_at','timezone','submitted_at']],
    ['availability',[82],['reason','effective_from','timezone','submitted_at']],
    ['template',[81],['name','timezone']],
    ['payroll_configuration',[84,100],['name','effective_from']],
    ['badge',[83,98],['secret_digest']],
    ['timecard',[84,99],['period_start','period_end','source_digest']],
    ['reminder',[73,74],['content','scheduled_at','timezone','communication_endpoint','patient']],
    ['message',[77],['body','request_key','conversation','sender_membership']],
    ['staff_request',[79],['due_at','message']]
  ];
  for(const [kind,ids,fields] of contracts) {
    add(`${kind} model rejects missing creation data`,ids,fc.constantFrom(...fields),async field=>{
      const r=await request('workforce_contract',{kind,attributes:{[field]:null}});
      assert.equal(r.valid,false);assert.ok(r.errors.includes(field),`${field} must have a field-specific error: ${r.errors}`);
    },validation);
  }
  add('time off model rejects zero or negative duration',[82],fc.integer({min:0,max:10080}),async minutes=>{
    const r=await request('workforce_contract',{kind:'time_off',operation:'reverse_interval',minutes});
    assert.equal(r.valid,false);assert.ok(r.errors.includes('ends_at'));
  },validation);
  add('availability model rejects impossible clock values',[82],fc.integer({min:24,max:99}),async hour=>{
    const r=await request('workforce_contract',{kind:'availability',attributes:{weekly_rules:[{day_of_week:1,start_time:`${hour}:00`,end_time:'17:00'}]}});
    assert.equal(r.valid,false);assert.ok(r.errors.includes('weekly_rules'));
  },validation);
  add('availability model requires an explicit valid weekday',[82],fc.constantFrom('missing',null,'not-a-day'),async day=>{
    const rule={start_time:'09:00',end_time:'17:00'};
    if(day!=='missing')rule.day_of_week=day;
    const r=await request('workforce_contract',{kind:'availability',attributes:{weekly_rules:[rule]}});
    assert.equal(r.valid,false,'Missing or nonnumeric weekday must not silently become Sunday');assert.ok(r.errors.includes('weekly_rules'));
  },validation);
  add('badge model rejects revocation without attribution',[83,98],fc.constantFrom('revoked','replaced'),async status=>{
    const r=await request('workforce_contract',{kind:'badge',attributes:{status}});
    assert.equal(r.valid,false);assert.ok(r.errors.includes('status'));
  },validation);
  add('timecard model rejects approval without reviewer and submission',[84,99],fc.constant(null),async()=>{
    const r=await request('workforce_contract',{kind:'timecard',attributes:{status:'approved'}});
    assert.equal(r.valid,false);for(const field of ['approved_at','approved_by_membership','submitted_at','submitted_by_membership'])assert.ok(r.errors.includes(field));
  },validation);
  add('reminder terminal state cannot be restarted',[75],fc.tuple(fc.constantFrom('cancelled','suppressed','actioned','expired'),fc.constantFrom('draft','scheduled','queued')),async([terminal,target])=>{
    const r=await request('workforce_contract',{kind:'reminder',operation:'terminal_transition',terminal,target});
    assert.equal(r.rejected,true);assert.equal(r.state,terminal);
  },{layer:'model persistence policy'});
  add('resolved staff request cannot be reopened',[79],fc.tuple(fc.constantFrom('resolved','declined','expired'),fc.constantFrom('open','acknowledged','in_progress')),async([terminal,target])=>{
    const r=await request('workforce_contract',{kind:'staff_request',operation:'terminal_transition',terminal,target});
    assert.equal(r.rejected,true);assert.equal(r.state,terminal);
  },{layer:'model persistence policy'});
  add('approved timecard rejects edit and deletion',[84,99,100],fc.stringMatching(/^[0-9a-bd-f]{64}$/),async digest=>{
    const r=await request('workforce_contract',{kind:'timecard',operation:'final_timecard',digest});
    assert.equal(r.updated,false);assert.equal(r.destroyed,false);assert.equal(r.exists,true);assert.equal(r.digest,r.old_digest);
  },{layer:'model persistence policy'});
}
