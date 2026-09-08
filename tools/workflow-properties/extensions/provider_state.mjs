export function register({add,request,assert,amount,cents}) {
  const options={layer:'application service / in-memory provider simulation'};
  for(const mode of ['retry','cancel','complete_unpaid','inactive_cards']) add(`simulated online invoice checkout ${mode} preserves payment state`,[...(mode==='retry'||mode==='inactive_cards'?[51]:[52])],amount,async n=>{
    const r=await request('provider_invoice_state',{mode,amount:cents(n),cents:n});
    assert.equal(r.allocations,0);
    if(mode==='inactive_cards'){assert.ok(r.error);assert.equal(r.create_calls,0);assert.equal(r.checkouts,0);}
    else {assert.equal(r.error,null);assert.equal(r.checkouts,1);assert.equal(r.create_calls,1);
      assert.equal(r.state,{retry:'processing',cancel:'canceled',complete_unpaid:'needs_reconciliation'}[mode]);
      assert.equal(r.expire_calls,mode==='cancel'?1:0);}
  },options);
  for(const mode of ['replay','unknown_recovery']) add(`local fixture membership ${mode} activates exactly once`,[57],amount,async n=>{
    const r=await request('provider_membership_state',{mode,amount:cents(n)});
    assert.equal(r.same_purchase,true);assert.equal(r.invoices,1);assert.equal(r.state,'active');
    assert.equal(r.allocations,1);assert.equal(r.receipts,1);assert.equal(r.active_events,1);
    if(mode==='unknown_recovery')assert.equal(r.blocked,true);
  },{layer:'application service / local fixture processor'});
}
