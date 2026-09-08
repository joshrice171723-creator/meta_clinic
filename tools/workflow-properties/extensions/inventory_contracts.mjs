export function register({add,fc,request,assert,blank}) {
  const layer={layer:'application service'};
  for(const field of ['reason','lot_number','expires_on','amount','location_id','lines']) {
    const arbitrary=field==='lines'?fc.constant(null):blank;
    add(`receipt service rejects missing ${field} without partial stock`,[65],arbitrary,async value=>{
      const r=await request('inventory_receipt_contract',{field,value});
      assert.ok(r.error,`Missing ${field} accepted`);assert.equal(r.receipts_added,0);assert.equal(Number(r.original_quantity),10);
    },layer);
  }
  for(const mode of ['same_location','overdraw','missing_reason','retry']) {
    add(`inventory transfer ${mode} preserves stock conservation`,[69],fc.integer({min:1,max:100}),async quantity=>{
      const r=await request('inventory_transfer_contract',{mode,quantity});
      assert.equal(Number(r.total),quantity*2);
      if(mode==='retry'){assert.equal(r.error,null);assert.equal(r.replay_same,true);assert.equal(r.transfers,1);assert.equal(Number(r.source),quantity);}
      else {assert.ok(r.error);assert.equal(r.transfers,0);assert.equal(Number(r.source),quantity*2);}
    },layer);
  }
  for(const field of ['location_id','assignee_id','due_on','blind','reason']) {
    add(`count creation rejects unanswered ${field}`,[70],field==='blind'?fc.constant(null):blank,async value=>{
      const r=await request('inventory_count_contract',{field,value});assert.ok(r.error);assert.equal(r.invalid_created,0);assert.equal(r.baseline,true);
    },layer);
  }
  add('count cannot complete before outstanding lines are resolved',[70],fc.constant(null),async()=>{
    const r=await request('inventory_count_contract',{mode:'premature_complete'});assert.ok(r.error);assert.equal(r.status,'open');assert.equal(Number(r.quantity),10);
  },layer);
  add('count skip retry and resume retain one event per action',[96],fc.constant(null),async()=>{
    const r=await request('inventory_count_contract',{mode:'skip'});assert.equal(r.same_event,true);assert.equal(r.events,2);assert.equal(r.latest,'resumed');assert.equal(Number(r.quantity),10);
  },layer);
  for(const field of ['reference','reason','required_disposition','lot_ids']) {
    add(`recall creation rejects missing ${field}`,[71],field==='lot_ids'?fc.constant([]):blank,async value=>{
      const r=await request('inventory_recall_contract',{field,value});assert.ok(r.error);assert.equal(r.invalid_created,0);assert.equal(r.baseline,true);
    },layer);
  }
  add('recall retry keeps one hold and cannot close with stock remaining',[71],fc.constant(null),async()=>{
    const r=await request('inventory_recall_contract',{});assert.equal(r.same_recall,true);assert.ok(r.error);assert.equal(r.status,'inventory_locked');assert.equal(r.holds,1);assert.equal(r.closures,0);assert.equal(Number(r.quantity),10);
  },layer);
}
