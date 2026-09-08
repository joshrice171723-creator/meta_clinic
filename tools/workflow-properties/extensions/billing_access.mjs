export function register({add,fc,request,assert,amount,blank,cents}) {
  const opts={layer:'application service'};
  for (const [label,lines] of [
    ['no invoice lines',[]],['missing line description',[{quantity:'1',unit_amount:'1.00'}]],
    ['missing line price',[{quantity:'1',description_snapshot:'Visit'}]],
    ['missing line quantity',[{unit_amount:'1.00',description_snapshot:'Visit'}]]
  ]) add(`invoice creation rejects ${label} without persistence`,[49],amount,async n=>{
    const r=await request('billing_invoice_contract',{amount:cents(n),mode:'create',lines});
    assert.ok(r.error); assert.equal(r.added,0);
  },opts);
  add('invalid invoice edit retains all original line data',[49],fc.tuple(amount,blank),async ([n,b])=>{
    const r=await request('billing_invoice_contract',{amount:cents(n),mode:'edit',lines:[{quantity:'1',unit_amount:'1.00',description_snapshot:b}]});
    assert.ok(r.error); assert.equal(r.unchanged,true);
  },opts);
  for(const mode of ['edit','delete_line']) add(`posted invoice rejects ${mode} and preserves lines`,[49],amount,async n=>{
    const r=await request('billing_invoice_contract',{amount:cents(n),mode,posted:true,lines:[{quantity:'1',unit_amount:'1.00',description_snapshot:'Changed'}]});
    assert.ok(r.error); assert.equal(r.unchanged,true);
  },opts);
  for(const action of ['credit','void']) add(`invoice ${action} requires a nonblank reason`,[54],fc.tuple(amount,blank),async ([n,b])=>{
    const r=await request('billing_adjustment_contract',{amount:cents(n),action,credit:cents(n),reason:b});
    assert.ok(r.error); assert.equal(r.status,'posted'); assert.equal(r.credits,0);
  },opts);
  add('invoice credit replay creates one credit and no cash refund',[54],amount,async n=>{
    const r=await request('billing_adjustment_contract',{amount:cents(n),action:'credit',credit:cents(n),retry:true});
    assert.equal(r.error,null); assert.equal(r.credits,1); assert.equal(r.refunded,0); assert.equal(r.replayed,true);
  },opts);
  add('invoice credit cannot exceed original charges',[54],amount,async n=>{
    const r=await request('billing_adjustment_contract',{amount:cents(n),action:'credit',credit:cents(n+1)});
    assert.ok(r.error); assert.equal(r.credits,0);
  },opts);
  add('paid invoice cannot be voided',[54],amount,async n=>{
    const r=await request('billing_adjustment_contract',{amount:cents(n),action:'void',paid:true});
    assert.ok(r.error); assert.equal(r.status,'posted');
  },opts);
  add('cash payment retry keeps one tender receipt and exact change',[50,60],fc.tuple(amount,amount),async ([n,extra])=>{
    const r=await request('billing_cash_contract',{amount:cents(n),tender:cents(n+extra),retry:true});
    assert.equal(r.error,null); assert.equal(r.tenders,1); assert.equal(r.allocations,1); assert.equal(r.receipts,1);
    assert.equal(Number(r.change),extra/100); assert.equal(Number(r.expected),n/100);
  },opts);
  add('cash payment rejects insufficient tender atomically',[50],amount,async n=>{
    const r=await request('billing_cash_contract',{amount:cents(n+1),tender:cents(n)});
    assert.ok(r.error); assert.equal(r.tenders,0); assert.equal(r.allocations,0); assert.equal(r.receipts,0);
  },opts);
  add('closed drawer refuses new cash payment',[50,56],amount,async n=>{
    const r=await request('billing_cash_contract',{amount:cents(n),tender:cents(n),closed:true});
    assert.ok(r.error); assert.equal(r.tenders,0); assert.equal(r.allocations,0);
  },opts);
  add('cash refund creates its receipt and removes cash from drawer totals',[55,56,60],amount,async n=>{
    const r=await request('billing_cash_contract',{amount:cents(n),tender:cents(n),refund:cents(n)});
    assert.equal(r.error,null); assert.equal(r.refunds,1); assert.equal(r.receipts,2); assert.equal(Number(r.expected),0);
  },opts);
  add('cash over-refund leaves no refund or refund receipt',[55],amount,async n=>{
    const r=await request('billing_cash_contract',{amount:cents(n),tender:cents(n),refund:cents(n+1)});
    assert.ok(r.error); assert.equal(r.refunds,0); assert.equal(r.receipts,1); assert.equal(Number(r.expected),n/100);
  },opts);
  for(const field of ['amount','duration','duration_unit','terms','components']) add(`membership publication definition rejects omitted ${field}`,[11],amount,async n=>{
    const r=await request('billing_membership_definition',{changes:{amount:cents(n)},omit:[field]}); assert.ok(r.error);
  },opts);
  add('membership publication requires nonblank terms',[11],blank,async b=>{
    assert.ok((await request('billing_membership_definition',{changes:{terms:b}})).error);
  },opts);
  add('membership publication rejects zero or negative prices',[11],fc.integer({min:-100000,max:0}),async n=>{
    assert.ok((await request('billing_membership_definition',{changes:{amount:(n/100).toFixed(2)}})).error);
  },opts);
}
