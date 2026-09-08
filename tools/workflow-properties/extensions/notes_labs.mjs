export function register({add,fc,request,assert,amount,blank}) {
  const opts={layer:'application service'};
  const note=(name,ids,action,arbitrary,predicate)=>add('Clinical notes: '+name,ids,arbitrary,async input=>predicate(await request('notes_contract',{action,...(typeof input==='object'?input:{suffix:input})})),opts);
  note('empty SOAP creation is rejected',[33],'blank_create',blank.map(blank=>({blank})),r=>{assert.ok(r.error);assert.equal(r.notes,0);});
  note('creation retry preserves one note and revision',[33,91],'create_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.notes,1);assert.equal(r.revisions,1);assert.equal(r.changed,'Clinic::Idempotency::Conflict');});
  note('revision retry preserves previous content and rejects stale edits',[33,91],'revise_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.revisions,2);assert.equal(r.original_preserved,true);assert.equal(r.stale,'ActiveRecord::StaleObjectError');});
  for(const [field,arb] of [['content_digest',fc.string({maxLength:20})],['revision_no',fc.integer({min:2,max:999})],['attestation_version',blank]]){
    note('signing rejects invalid '+field,[34],'invalid_sign',arb.map(value=>({field,value})),r=>{assert.ok(r.error);assert.equal(r.signatures,0);});
  }
  note('signing retry is unique and signed content cannot be edited',[34],'sign_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.signatures,1);assert.equal(r.revisions,1);assert.ok(r.edit);});
  note('unsigned notes cannot enter signed correction flow',[34],'unsigned_correction',amount,r=>{assert.ok(r.error);assert.equal(r.revisions,1);});
  note('correction payload requires a reason',[34],'blank_correction',blank.map(blank=>({blank})),r=>{assert.ok(r.error);assert.equal(r.revisions,1);});
  note('correction retry preserves signed original and separate unsigned revision',[34],'correction_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.revisions,2);assert.equal(r.signatures,1);assert.equal(r.original_preserved,true);assert.equal(r.unsigned_correction,true);assert.equal(r.prior,true);});
  note('closure rejects end times at or before arrival',[35],'invalid_close',fc.integer({min:0,max:100000}).map(seconds=>({seconds})),r=>{assert.ok(r.error);assert.equal(r.status,'open');assert.equal(r.ended,false);});
  note('closure retry commits once and rejects changed time',[35,91],'close_retry',amount.map(seconds=>({seconds})),r=>{assert.equal(r.same,true);assert.equal(r.status,'completed');assert.equal(r.receipts,1);assert.equal(r.changed,'Clinic::Idempotency::Conflict');});
  const lab=(name,ids,action,arbitrary,predicate)=>add('Lab workflow: '+name,ids,arbitrary,async input=>predicate(await request('lab_contract',{action,...(typeof input==='object'?input:{suffix:input})})),opts);
  for(const field of ['source_name','title','name','value','collected_at','issued_at']){
    lab('creation requires '+field,[45],'invalid_create',blank.map(value=>({field,value})),r=>{assert.ok(r.error);assert.equal(r.reports,0);});
  }
  lab('creation requires patient confirmation',[45],'invalid_create',fc.constantFrom(false,null).map(value=>({field:'confirmed_patient',value})),r=>{assert.ok(r.error);assert.equal(r.reports,0);});
  lab('creation requires at least one result',[45],'invalid_create',fc.constant({field:'results',value:[]}),r=>{assert.ok(r.error);assert.equal(r.reports,0);});
  lab('creation replay keeps one report and version',[45],'create_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.replayed,true);assert.equal(r.reports,1);assert.equal(r.versions,1);});
  lab('corrected version retry preserves original and blocks stale review',[46,47],'version_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.versions,2);assert.equal(r.original_value,r.expected_value);assert.equal(r.stale,'ActiveRecord::StaleObjectError');assert.equal(r.prior_reviewed,false);});
  lab('required follow-up instructions cannot be blank',[47,48],'required_follow_up_blank',blank.map(blank=>({blank})),r=>{assert.ok(r.error);assert.equal(r.reviewed,false);assert.equal(r.follow_up,false);});
  lab('follow-up cannot precede report review',[48],'follow_up_before_review',amount,r=>{assert.ok(r.error);assert.equal(r.follow_up,false);});
  lab('review replay records one follow-up decision',[47,48],'review_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.follow_ups,1);assert.equal(r.reviewed,true);});
  lab('follow-up completion requires an outcome',[48],'completion_blank',blank.map(blank=>({blank})),r=>{assert.ok(r.error);assert.equal(r.state,'open');});
  lab('follow-up completion replay commits once',[48],'completion_retry',amount,r=>{assert.equal(r.same,true);assert.equal(r.follow_ups,1);assert.equal(r.state,'completed');});
}
