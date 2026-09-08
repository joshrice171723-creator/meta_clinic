export function register({add,fc,request,assert,blank}) {
  const layer={layer:'application service'};
  for(const mode of ['overdraw','missing_reason','retry'])add(`office supply use ${mode} protects available quantity`,[40],fc.integer({min:1,max:100}),async quantity=>{
    const r=await request('office_supply_contract',{quantity,mode});
    if(mode==='retry'){assert.equal(r.error,null);assert.equal(r.same,true);assert.equal(r.quantity,quantity);assert.equal(r.movements,2);}
    else{assert.ok(r.error);assert.equal(r.quantity,quantity*2);assert.equal(r.movements,1);}
  },layer);
  add('invalid reorder point edit preserves catalog and does not create an order',[94],fc.integer({min:-100000,max:-1}),async value=>{
    const r=await request('reorder_point_contract',{value});assert.ok(r.error);assert.equal(r.current,r.prior);assert.equal(Number(r.quantity),10);assert.equal(r.orders,0);
  },layer);
  add('exception review requires a reason before creating review evidence',[72],blank,async reason=>{
    const r=await request('exception_review_contract',{mode:'missing_reason',reason});assert.ok(r.error);assert.equal(r.invalid_created,0);assert.equal(r.baseline,true);
  },layer);
  add('exception review retry does not release stock or reactivate product',[72],fc.constant(null),async()=>{
    const r=await request('exception_review_contract',{});assert.equal(r.same,true);assert.equal(r.records,1);assert.equal(Number(r.quantity),10);assert.equal(r.active,false);
  },layer);
}
