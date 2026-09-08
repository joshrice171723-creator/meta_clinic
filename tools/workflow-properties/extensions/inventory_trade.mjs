export function register({add,fc,request,assert}) {
  const amount=fc.integer({min:1,max:100});const layer={layer:'application service'};
  add('partial supplier delivery replay retains remaining order balance',[64,66],amount,async quantity=>{
    const r=await request('inventory_delivery_contract',{quantity});assert.equal(r.same_receipt,true);assert.equal(r.receipts,1);assert.equal(Number(r.received),quantity);assert.equal(Number(r.remaining),1);assert.equal(r.status,'partially_received');assert.equal(Number(r.stock),10+quantity);
  },layer);
  for(const mode of ['overreturn','missing_reason','retry'])add(`supplier return ${mode} preserves receipt and stock accounting`,[67],amount,async quantity=>{
    const r=await request('inventory_return_contract',{quantity,mode});if(mode==='retry'){assert.equal(r.error,null);assert.equal(r.same,true);assert.equal(r.returns,1);assert.equal(Number(r.stock),10);}else{assert.ok(r.error);assert.equal(r.returns,0);assert.equal(Number(r.stock),10+quantity);}
  },layer);
  for(const mode of ['valid','wrong_total','missing_reference'])add(`supplier invoice ${mode} validates reconciliation evidence`,[68],amount,async quantity=>{
    const r=await request('inventory_supplier_invoice_contract',{quantity,mode});if(mode==='missing_reference'){assert.ok(r.error);assert.equal(r.invoices,0);}else{assert.equal(r.error,null);assert.equal(r.same,true);assert.equal(r.invoices,1);assert.equal(r.status,mode==='valid'?'matched':'discrepancy');}
  },layer);
  add('inventory scan is exact and never records stock movement',[93],fc.constantFrom('INV-PROP','INV-PROP-other','INV'),async code=>{
    const r=await request('inventory_scan_contract',{code});assert.equal(r.status,code==='INV-PROP'?'matched':'unmatched');assert.equal(r.movements_added,0);assert.equal(Number(r.stock),10);
  },layer);
  for(const mode of ['missing_reason','overdraw','retry'])add(`lot adjustment ${mode} protects stock accounting`,[95],amount,async quantity=>{
    const r=await request('inventory_adjust_contract',{quantity,mode});if(mode==='retry'){assert.equal(r.error,null);assert.equal(r.same,true);assert.equal(Number(r.stock),quantity);}else{assert.ok(r.error);assert.equal(Number(r.stock),quantity*2);}
  },layer);
}
